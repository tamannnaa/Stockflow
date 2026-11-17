import { Prisma, OrderStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { HttpError } from '../../utils/httpError';
import { logActivity } from '../../utils/activity';
import { notifyIfCrossedReorder } from '../../utils/stockAlerts';
import type { CreateOrderInput, ListOrdersQuery } from './orders.schema';

// Allowed status transitions — prevents e.g. reviving a cancelled order.
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['FULFILLED', 'CANCELLED'],
  FULFILLED: [],
  CANCELLED: [],
};

const ORDER_NUMBER_RETRIES = 3;

function isOrderNumberClash(err: unknown) {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    String(err.meta?.target ?? '').includes('order_number')
  );
}

export const ordersService = {
  /**
   * Creates an order and adjusts stock ATOMICALLY.
   *
   * A SALE decrements stock; a PURCHASE increments it. All writes — order,
   * order_items, product quantity updates, ledger rows, notifications and the
   * audit entry — happen inside a single transaction. Sale decrements are
   * conditional (`quantity >= n`), so two concurrent sales can never push stock
   * below zero: the loser's update matches 0 rows and the transaction rolls back.
   */
  async create(userId: number, input: CreateOrderInput) {
    // Order numbers are sequential per type; a concurrent insert can clash on the
    // unique index, in which case we simply retry with the next number.
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.createOnce(userId, input);
      } catch (err) {
        if (!isOrderNumberClash(err) || attempt >= ORDER_NUMBER_RETRIES) throw err;
      }
    }
  },

  /**
   * Works out which customer a SALE belongs to and the name snapshot to store.
   *  - customerId given → must exist and be active; snapshot = customer's current name.
   *  - only customerName given (legacy clients) → link to the single active customer
   *    with that name, or create one in the same transaction.
   *  - neither → walk-in sale (no customer).
   * PURCHASE orders never get a customer (also enforced by a DB check constraint).
   */
  async resolveCustomer(tx: Prisma.TransactionClient, input: CreateOrderInput, userId: number) {
    if (input.type !== 'SALE') return { customerId: undefined, customerName: input.customerName || undefined };

    if (input.customerId) {
      const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
      if (!customer) throw HttpError.badRequest('Customer not found');
      if (!customer.isActive) throw HttpError.badRequest(`${customer.name} is archived. Restore the customer to record new sales.`);
      return { customerId: customer.id, customerName: customer.name };
    }

    const name = input.customerName?.trim();
    if (!name) return { customerId: undefined, customerName: undefined };

    const matches = await tx.customer.findMany({ where: { name: { equals: name, mode: 'insensitive' } } });
    const active = matches.filter((c) => c.isActive);
    if (active.length === 1) return { customerId: active[0]!.id, customerName: active[0]!.name };
    if (active.length > 1) {
      throw HttpError.badRequest(`More than one customer is named "${name}". Choose the customer from the list.`);
    }
    if (matches.length > 0) {
      throw HttpError.badRequest(`${matches[0]!.name} is archived. Restore the customer to record new sales.`);
    }
    const created = await tx.customer.create({ data: { name } });
    await logActivity(tx, {
      userId,
      action: 'customer.created',
      entity: 'customer',
      entityId: created.id,
      metadata: { name: created.name, source: 'sales order' },
    });
    return { customerId: created.id, customerName: created.name };
  },

  async createOnce(userId: number, input: CreateOrderInput) {
    return prisma.$transaction(async (tx) => {
      if (input.supplierId) {
        const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
        if (!supplier) throw HttpError.badRequest('Supplier not found');
      }
      const customer = await this.resolveCustomer(tx, input, userId);

      const productIds = input.items.map((i) => i.productId);
      const products = await tx.product.findMany({ where: { id: { in: productIds } } });
      const byId = new Map(products.map((p) => [p.id, p]));

      // A PENDING order is a draft/quote: it is recorded but does not touch stock
      // until it is confirmed (see updateStatus → applyStock).
      const isDraft = input.status === 'PENDING';

      // Validate every line before mutating anything.
      for (const item of input.items) {
        const product = byId.get(item.productId);
        if (!product || !product.isActive) {
          throw HttpError.badRequest(`Product ${item.productId} not found`);
        }
        if (!isDraft && input.type === 'SALE' && product.quantityInStock < item.quantity) {
          throw HttpError.conflict('INSUFFICIENT_STOCK', `Not enough stock for "${product.name}"`, {
            productId: product.id,
            available: product.quantityInStock,
            requested: item.quantity,
          });
        }
      }

      // Decimal arithmetic end to end — no float rounding on money.
      const lines = input.items.map((item) => {
        const product = byId.get(item.productId)!;
        const unitPrice = input.type === 'SALE' ? product.unitPrice : product.costPrice;
        return { productId: item.productId, quantity: item.quantity, unitPrice, lineTotal: unitPrice.mul(item.quantity) };
      });
      const totalAmount = lines.reduce((sum, l) => sum.add(l.lineTotal), new Prisma.Decimal(0));

      const order = await tx.order.create({
        data: {
          orderNumber: await this.nextOrderNumber(tx, input.type),
          type: input.type,
          status: isDraft ? 'PENDING' : 'CONFIRMED',
          supplierId: input.supplierId,
          customerId: customer.customerId,
          customerName: customer.customerName,
          totalAmount,
          createdById: userId,
          items: { create: lines },
        },
        include: { items: true },
      });

      if (!isDraft) await this.applyStock(tx, order, input.items, userId);

      await logActivity(tx, {
        userId,
        action: 'order.created',
        entity: 'order',
        entityId: order.id,
        metadata: { orderNumber: order.orderNumber, type: order.type, status: order.status, totalAmount: totalAmount.toString() },
      });

      return order;
    });
  },

  /**
   * Commits an order's stock effect: SALE decrements, PURCHASE increments, and
   * each line writes an immutable ledger row. Sale decrements are conditional
   * (`quantity >= n`) so concurrent sales can never drive stock negative.
   * Runs when an order is created as CONFIRMED, or when a PENDING draft is confirmed.
   */
  async applyStock(
    tx: Prisma.TransactionClient,
    order: { id: number; type: CreateOrderInput['type'] },
    items: { productId: number; quantity: number }[],
    userId: number,
  ) {
    for (const item of items) {
      const before = await tx.product.findUniqueOrThrow({ where: { id: item.productId } });
      if (order.type === 'SALE') {
        const res = await tx.product.updateMany({
          where: { id: item.productId, quantityInStock: { gte: item.quantity } },
          data: { quantityInStock: { decrement: item.quantity } },
        });
        if (res.count === 0) {
          throw HttpError.conflict('INSUFFICIENT_STOCK', `Not enough stock for "${before.name}"`, {
            productId: before.id,
            available: before.quantityInStock,
            requested: item.quantity,
          });
        }
      } else {
        await tx.product.update({
          where: { id: item.productId },
          data: { quantityInStock: { increment: item.quantity } },
        });
      }
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          changeQty: order.type === 'SALE' ? -item.quantity : item.quantity,
          reason: order.type,
          referenceOrderId: order.id,
          createdById: userId,
        },
      });
      if (order.type === 'SALE') await notifyIfCrossedReorder(tx, item.productId, before.quantityInStock);
    }
  },

  async nextOrderNumber(tx: Prisma.TransactionClient, type: CreateOrderInput['type']) {
    const prefix = type === 'SALE' ? 'SO' : 'PO';
    const count = await tx.order.count({ where: { type } });
    return `${prefix}-${String(count + 1).padStart(6, '0')}`;
  },

  async list(q: ListOrdersQuery) {
    const where: Prisma.OrderWhereInput = {
      ...(q.type ? { type: q.type } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.search
        ? {
            OR: [
              { orderNumber: { contains: q.search, mode: 'insensitive' } },
              { customerName: { contains: q.search, mode: 'insensitive' } },
              { supplier: { name: { contains: q.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [total, data] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: {
          createdBy: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
    ]);
    return {
      data,
      pagination: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
    };
  },

  async getById(id: number) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { product: { select: { id: true, sku: true, name: true } } } },
        createdBy: { select: { id: true, name: true } },
        supplier: true,
        customer: { select: { id: true, name: true, companyName: true, email: true, phone: true, isActive: true } },
        movements: { orderBy: { createdAt: 'asc' }, include: { createdBy: { select: { id: true, name: true } } } },
      },
    });
    if (!order) throw HttpError.notFound('Order not found');
    return order;
  },

  /**
   * Updates status with transition validation, all inside a transaction:
   *  - PENDING → CONFIRMED commits the stock effect (applyStock). A sale that
   *    no longer has enough stock is rejected and stays PENDING.
   *  - CONFIRMED → CANCELLED reverses the stock effect. Cancelling a PURCHASE
   *    whose stock has already been sold is rejected instead of driving stock negative.
   *  - PENDING → CANCELLED has no stock effect (nothing was ever applied).
   *  - CONFIRMED → FULFILLED marks delivery; stock was already committed.
   */
  async updateStatus(id: number, next: OrderStatus, userId: number) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id }, include: { items: { include: { product: true } } } });
      if (!order) throw HttpError.notFound('Order not found');

      if (!TRANSITIONS[order.status].includes(next)) {
        throw HttpError.conflict('INVALID_TRANSITION', `Cannot change status from ${order.status} to ${next}`);
      }

      if (order.status === 'PENDING' && next === 'CONFIRMED') {
        await this.applyStock(tx, order, order.items, userId);
      }

      // Only reverse stock that was actually applied (i.e. the order was CONFIRMED).
      if (next === 'CANCELLED' && order.status === 'CONFIRMED') {
        for (const item of order.items) {
          if (order.type === 'SALE') {
            await tx.product.update({
              where: { id: item.productId },
              data: { quantityInStock: { increment: item.quantity } },
            });
          } else {
            const res = await tx.product.updateMany({
              where: { id: item.productId, quantityInStock: { gte: item.quantity } },
              data: { quantityInStock: { decrement: item.quantity } },
            });
            if (res.count === 0) {
              throw HttpError.conflict(
                'STOCK_ALREADY_USED',
                `Cannot cancel: units of "${item.product.name}" from this purchase have already been sold`,
              );
            }
          }
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              changeQty: order.type === 'SALE' ? item.quantity : -item.quantity,
              reason: order.type === 'SALE' ? 'RETURN' : 'ADJUSTMENT',
              referenceOrderId: order.id,
              createdById: userId,
            },
          });
          if (order.type === 'PURCHASE') {
            await notifyIfCrossedReorder(tx, item.productId, item.product.quantityInStock);
          }
        }
      }

      const updated = await tx.order.update({ where: { id }, data: { status: next } });
      await logActivity(tx, {
        userId,
        action: 'order.status_changed',
        entity: 'order',
        entityId: id,
        metadata: { orderNumber: order.orderNumber, from: order.status, to: next },
      });
      return updated;
    });
  },
};
