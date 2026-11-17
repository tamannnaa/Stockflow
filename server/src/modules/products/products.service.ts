import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { HttpError } from '../../utils/httpError';
import { logActivity } from '../../utils/activity';
import { notifyIfCrossedReorder } from '../../utils/stockAlerts';
import type {
  AdjustStockInput,
  CreateProductInput,
  ListProductsQuery,
  PaginationQuery,
  UpdateProductInput,
} from './products.schema';

export const productsService = {
  async list(q: ListProductsQuery) {
    const and: Prisma.ProductWhereInput[] = [{ isActive: true }];
    if (q.categoryId) and.push({ categoryId: q.categoryId });
    if (q.supplierId) and.push({ supplierId: q.supplierId });
    if (q.search) {
      and.push({
        OR: [
          { name: { contains: q.search, mode: 'insensitive' } },
          { sku: { contains: q.search, mode: 'insensitive' } },
        ],
      });
    }
    // Column-to-column comparisons use Prisma field references.
    const reorder = prisma.product.fields.reorderLevel;
    if (q.stock === 'out') and.push({ quantityInStock: { lte: 0 } });
    if (q.stock === 'low') and.push({ quantityInStock: { gt: 0 } }, { quantityInStock: { lte: reorder } });
    if (q.stock === 'in') and.push({ quantityInStock: { gt: reorder } });
    const where: Prisma.ProductWhereInput = { AND: and };

    const [total, items] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy: { [q.sort]: q.order },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: { category: true, supplier: true },
      }),
    ]);

    return {
      data: items,
      pagination: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
    };
  },

  async getById(id: number) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: { category: true, supplier: true },
    });
    if (!product) throw HttpError.notFound('Product not found');
    return product;
  },

  async create(input: CreateProductInput, userId: number) {
    const exists = await prisma.product.findUnique({ where: { sku: input.sku } });
    if (exists) throw HttpError.conflict('SKU_TAKEN', 'A product with this SKU already exists');
    return prisma.$transaction(async (tx) => {
      const product = await tx.product.create({ data: input });
      // Opening stock is recorded in the ledger so history always explains the current quantity.
      if (product.quantityInStock > 0) {
        await tx.stockMovement.create({
          data: { productId: product.id, changeQty: product.quantityInStock, reason: 'ADJUSTMENT', createdById: userId },
        });
      }
      await logActivity(tx, {
        userId,
        action: 'product.created',
        entity: 'product',
        entityId: product.id,
        metadata: { sku: product.sku, name: product.name },
      });
      return product;
    });
  },

  async update(id: number, input: UpdateProductInput, userId: number) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.product.findUnique({ where: { id } });
      if (!current) throw HttpError.notFound('Product not found');
      if (input.sku && input.sku !== current.sku) {
        const taken = await tx.product.findUnique({ where: { sku: input.sku } });
        if (taken) throw HttpError.conflict('SKU_TAKEN', 'A product with this SKU already exists');
      }
      const updated = await tx.product.update({ where: { id }, data: input });
      // A direct quantity edit is still a stock change: keep the ledger complete.
      if (input.quantityInStock !== undefined && input.quantityInStock !== current.quantityInStock) {
        await tx.stockMovement.create({
          data: {
            productId: id,
            changeQty: input.quantityInStock - current.quantityInStock,
            reason: 'ADJUSTMENT',
            createdById: userId,
          },
        });
        await notifyIfCrossedReorder(tx, id, current.quantityInStock);
      }
      await logActivity(tx, {
        userId,
        action: 'product.updated',
        entity: 'product',
        entityId: id,
        metadata: { fields: Object.keys(input) },
      });
      return updated;
    });
  },

  /** Soft delete — preserves order history that references the product. */
  async remove(id: number, userId: number) {
    const product = await this.getById(id);
    await prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data: { isActive: false } });
      await logActivity(tx, {
        userId,
        action: 'product.archived',
        entity: 'product',
        entityId: id,
        metadata: { sku: product.sku, name: product.name },
      });
    });
  },

  /**
   * Manual stock correction (count, damage, customer return).
   * Decrements are conditional (`quantity >= n`) so stock can never go negative,
   * even with concurrent requests.
   */
  async adjust(id: number, input: AdjustStockInput, userId: number) {
    return prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id } });
      if (!product || !product.isActive) throw HttpError.notFound('Product not found');

      if (input.changeQty < 0) {
        const res = await tx.product.updateMany({
          where: { id, quantityInStock: { gte: -input.changeQty } },
          data: { quantityInStock: { decrement: -input.changeQty } },
        });
        if (res.count === 0) {
          throw HttpError.conflict('INSUFFICIENT_STOCK', `Only ${product.quantityInStock} units of "${product.name}" in stock`, {
            available: product.quantityInStock,
            requested: -input.changeQty,
          });
        }
      } else {
        await tx.product.update({ where: { id }, data: { quantityInStock: { increment: input.changeQty } } });
      }

      await tx.stockMovement.create({
        data: { productId: id, changeQty: input.changeQty, reason: input.reason, createdById: userId },
      });
      await notifyIfCrossedReorder(tx, id, product.quantityInStock);
      await logActivity(tx, {
        userId,
        action: 'stock.adjusted',
        entity: 'product',
        entityId: id,
        metadata: { sku: product.sku, changeQty: input.changeQty, reason: input.reason, note: input.note ?? null },
      });
      return tx.product.findUnique({ where: { id }, include: { category: true, supplier: true } });
    });
  },

  async movements(id: number, q: PaginationQuery) {
    await this.getById(id);
    const where = { productId: id };
    const [total, data] = await Promise.all([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: {
          createdBy: { select: { id: true, name: true } },
          order: { select: { id: true, orderNumber: true, type: true } },
        },
      }),
    ]);
    return { data, pagination: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } };
  },

  async lowStock() {
    // Items at or below their reorder level (raw SQL: column-to-column comparison).
    return prisma.$queryRaw`
      SELECT id, sku, name, quantity_in_stock AS "quantityInStock", reorder_level AS "reorderLevel"
      FROM products
      WHERE is_active = true AND quantity_in_stock <= reorder_level
      ORDER BY quantity_in_stock ASC`;
  },
};
