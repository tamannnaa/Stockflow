import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { HttpError } from '../../utils/httpError';
import { logActivity } from '../../utils/activity';
import type { CustomerInput, ListCustomersQuery } from './customers.schema';

type Db = typeof prisma | Prisma.TransactionClient;

/**
 * Statistics only count committed SALE orders (CONFIRMED or FULFILLED): cancelled
 * orders and PENDING drafts never inflate spend. Cancelled orders stay
 * linked for history. Money stays NUMERIC in SQL and is
 * rounded to 2 dp before leaving the service.
 */
const STATS_CTE = Prisma.sql`
  WITH stats AS (
    SELECT customer_id,
           COUNT(*)::int            AS orders,
           SUM(total_amount)        AS spent,
           MAX(created_at)          AS last_order_at,
           MIN(created_at)          AS first_order_at
    FROM orders
    WHERE type = 'SALE' AND status IN ('CONFIRMED', 'FULFILLED') AND customer_id IS NOT NULL
    GROUP BY customer_id
  ),
  units AS (
    SELECT o.customer_id, SUM(oi.quantity)::int AS units
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.type = 'SALE' AND o.status IN ('CONFIRMED', 'FULFILLED') AND o.customer_id IS NOT NULL
    GROUP BY o.customer_id
  ),
  all_orders AS (
    SELECT customer_id, COUNT(*)::int AS total
    FROM orders
    WHERE customer_id IS NOT NULL
    GROUP BY customer_id
  )`;

const SELECT_WITH_STATS = Prisma.sql`
  SELECT c.id, c.name, c.company_name AS "companyName", c.email, c.phone, c.address, c.gstin,
         c.is_active AS "isActive", c.created_at AS "createdAt", c.updated_at AS "updatedAt",
         COALESCE(s.orders, 0)                AS "orders",
         COALESCE(s.spent, 0)::numeric(14,2)  AS "spent",
         s.last_order_at                      AS "lastOrderAt",
         s.first_order_at                     AS "firstOrderAt",
         COALESCE(u.units, 0)                 AS "units",
         COALESCE(a.total, 0)                 AS "allOrders"
  FROM customers c
  LEFT JOIN stats s      ON s.customer_id = c.id
  LEFT JOIN units u      ON u.customer_id = c.id
  LEFT JOIN all_orders a ON a.customer_id = c.id`;

interface CustomerRow {
  id: number;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  gstin: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  orders: number;
  spent: Prisma.Decimal;
  lastOrderAt: Date | null;
  firstOrderAt: Date | null;
  units: number;
  allOrders: number;
}

function shape(r: CustomerRow) {
  const spent = new Prisma.Decimal(r.spent ?? 0);
  const avg = r.orders > 0 ? spent.div(r.orders).toDecimalPlaces(2) : new Prisma.Decimal(0);
  return {
    id: r.id,
    name: r.name,
    companyName: r.companyName,
    email: r.email,
    phone: r.phone,
    address: r.address,
    gstin: r.gstin,
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    stats: {
      orders: r.orders,
      totalSpent: spent.toNumber(),
      avgOrderValue: avg.toNumber(),
      lastOrderAt: r.lastOrderAt,
      firstOrderAt: r.firstOrderAt,
      unitsPurchased: r.units,
    },
    /** All linked orders incl. cancelled — decides delete (0) vs archive. */
    orderCount: r.allOrders,
  };
}

// Whitelisted ORDER BY expressions (never interpolate user input into SQL).
const SORTS: Record<ListCustomersQuery['sort'], Prisma.Sql> = {
  name: Prisma.sql`lower(c.name)`,
  createdAt: Prisma.sql`c.created_at`,
  orders: Prisma.sql`COALESCE(s.orders, 0)`,
  totalSpent: Prisma.sql`COALESCE(s.spent, 0)`,
  lastOrderAt: Prisma.sql`s.last_order_at`,
};

async function assertUnique(db: Db, input: CustomerInput, excludeId?: number) {
  const notSelf = excludeId ? { id: { not: excludeId } } : {};
  if (input.email) {
    const clash = await db.customer.findFirst({ where: { ...notSelf, email: { equals: input.email, mode: 'insensitive' } } });
    if (clash) throw HttpError.conflict('EMAIL_TAKEN', `Another customer (${clash.name}) already uses this email`);
  }
  if (input.gstin) {
    const clash = await db.customer.findFirst({ where: { ...notSelf, gstin: input.gstin } });
    if (clash) throw HttpError.conflict('GSTIN_TAKEN', `Another customer (${clash.name}) already has this GSTIN`);
  }
  // Same name + same company is almost certainly a duplicate.
  const clash = await db.customer.findFirst({
    where: {
      ...notSelf,
      name: { equals: input.name, mode: 'insensitive' },
      companyName: input.companyName ? { equals: input.companyName, mode: 'insensitive' } : null,
    },
  });
  if (clash) {
    throw HttpError.conflict(
      'CUSTOMER_EXISTS',
      `A customer named "${clash.name}"${clash.companyName ? ` at ${clash.companyName}` : ''} already exists${clash.isActive ? '' : ' (archived)'}`,
      { customerId: clash.id },
    );
  }
}

const toData = (input: CustomerInput) => ({
  name: input.name,
  companyName: input.companyName ?? null,
  email: input.email ?? null,
  phone: input.phone ?? null,
  address: input.address ?? null,
  gstin: input.gstin ?? null,
});

export const customersService = {
  async list(q: ListCustomersQuery) {
    const conditions: Prisma.Sql[] = [];
    if (q.status === 'active') conditions.push(Prisma.sql`c.is_active = true`);
    if (q.status === 'archived') conditions.push(Prisma.sql`c.is_active = false`);
    if (q.search) {
      const term = `%${q.search}%`;
      conditions.push(Prisma.sql`(
        c.name ILIKE ${term} OR c.company_name ILIKE ${term} OR c.email ILIKE ${term}
        OR c.phone ILIKE ${term} OR c.gstin ILIKE ${term})`);
    }
    const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
    const dir = q.order === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;

    const [rows, [{ total }], [walkIn]] = await Promise.all([
      prisma.$queryRaw<CustomerRow[]>`
        ${STATS_CTE}
        ${SELECT_WITH_STATS}
        ${where}
        ORDER BY ${SORTS[q.sort]} ${dir} NULLS LAST, c.id ASC
        LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`,
      prisma.$queryRaw<{ total: number }[]>`
        SELECT COUNT(*)::int AS total FROM customers c ${where}`,
      prisma.$queryRaw<{ orders: number; total: unknown }[]>`
        SELECT COUNT(*)::int AS orders, COALESCE(SUM(total_amount), 0) AS total
        FROM orders
        WHERE type = 'SALE' AND status IN ('CONFIRMED', 'FULFILLED') AND customer_id IS NULL`,
    ]);

    return {
      data: rows.map(shape),
      pagination: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
      /** Sales not linked to any customer (walk-ins and unnamed legacy orders). */
      walkIn: { orders: walkIn.orders, total: Number(walkIn.total) },
    };
  },

  async getStats(id: number) {
    const [row] = await prisma.$queryRaw<CustomerRow[]>`
      ${STATS_CTE}
      ${SELECT_WITH_STATS}
      WHERE c.id = ${id}`;
    if (!row) throw HttpError.notFound('Customer not found');
    return shape(row);
  },

  async getById(id: number) {
    const customer = await this.getStats(id);
    const orders = await prisma.order.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        orderNumber: true,
        type: true,
        status: true,
        totalAmount: true,
        customerName: true,
        createdAt: true,
        _count: { select: { items: true } },
      },
    });
    return { ...customer, orders };
  },

  async create(input: CustomerInput, userId: number) {
    return prisma.$transaction(async (tx) => {
      await assertUnique(tx, input);
      const customer = await tx.customer.create({ data: toData(input) });
      await logActivity(tx, {
        userId,
        action: 'customer.created',
        entity: 'customer',
        entityId: customer.id,
        metadata: { name: customer.name },
      });
      return customer;
    }).then((c) => this.getStats(c.id));
  },

  /**
   * Replaces customer details. Historical orders are NOT touched: their
   * customer_name snapshot keeps the name used at the time of sale.
   */
  async update(id: number, input: CustomerInput, userId: number) {
    await prisma.$transaction(async (tx) => {
      const current = await tx.customer.findUnique({ where: { id } });
      if (!current) throw HttpError.notFound('Customer not found');
      await assertUnique(tx, input, id);
      await tx.customer.update({ where: { id }, data: toData(input) });
      const changed = (Object.keys(toData(input)) as (keyof ReturnType<typeof toData>)[]).filter(
        (k) => (current[k] ?? null) !== (toData(input)[k] ?? null),
      );
      await logActivity(tx, {
        userId,
        action: 'customer.updated',
        entity: 'customer',
        entityId: id,
        metadata: { name: input.name, fields: changed },
      });
    });
    return this.getStats(id);
  },

  async setArchived(id: number, archived: boolean, userId: number) {
    await prisma.$transaction(async (tx) => {
      const current = await tx.customer.findUnique({ where: { id } });
      if (!current) throw HttpError.notFound('Customer not found');
      await tx.customer.update({ where: { id }, data: { isActive: !archived } });
      await logActivity(tx, {
        userId,
        action: archived ? 'customer.archived' : 'customer.restored',
        entity: 'customer',
        entityId: id,
        metadata: { name: current.name },
      });
    });
    return this.getStats(id);
  },

  /** Hard delete is only allowed for customers with no orders at all; otherwise archive. */
  async remove(id: number, userId: number) {
    await prisma.$transaction(async (tx) => {
      const current = await tx.customer.findUnique({ where: { id }, include: { _count: { select: { orders: true } } } });
      if (!current) throw HttpError.notFound('Customer not found');
      if (current._count.orders > 0) {
        throw HttpError.conflict(
          'CUSTOMER_HAS_ORDERS',
          `${current.name} has ${current._count.orders} order${current._count.orders === 1 ? '' : 's'} and can't be deleted. Archive the customer instead to keep their history.`,
          { orders: current._count.orders },
        );
      }
      await tx.customer.delete({ where: { id } });
      await logActivity(tx, { userId, action: 'customer.deleted', entity: 'customer', entityId: id, metadata: { name: current.name } });
    });
  },
};
