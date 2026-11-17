import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../app';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { seedDemoData } from '../seed/demo';

/**
 * Production-readiness suite: auth, RBAC, products, the PENDING → CONFIRMED →
 * FULFILLED/CANCELLED stock workflow, ledger consistency, customer statistics,
 * health checks and the demo seed (run twice for idempotency).
 */
const app = createApp();
const api = '/api/v1';
type Role = 'ADMIN' | 'MANAGER' | 'STAFF';
const tokens: Record<Role, string> = { ADMIN: '', MANAGER: '', STAFF: '' };
const ids: Record<string, number> = {};
const as = (role: Role) => ({ Authorization: `Bearer ${tokens[role]}` });
const stockOf = async (id: number) => (await prisma.product.findUniqueOrThrow({ where: { id } })).quantityInStock;

const TRUNCATE =
  'TRUNCATE activity_logs, notifications, stock_movements, order_items, orders, customers, products, suppliers, categories, users RESTART IDENTITY CASCADE';

/** SUM(ledger) must equal stock for every product, and no stock may be negative. */
async function ledgerProblems() {
  return prisma.$queryRaw<{ sku: string; stock: number; ledger: number }[]>`
    SELECT p.sku, p.quantity_in_stock AS stock, COALESCE(SUM(m.change_qty), 0)::int AS ledger
    FROM products p LEFT JOIN stock_movements m ON m.product_id = p.id
    GROUP BY p.id
    HAVING p.quantity_in_stock <> COALESCE(SUM(m.change_qty), 0) OR p.quantity_in_stock < 0`;
}

beforeAll(async () => {
  await prisma.$executeRawUnsafe(TRUNCATE);
  const passwordHash = await bcrypt.hash('Password123!', 4);
  for (const role of ['ADMIN', 'MANAGER', 'STAFF'] as const) {
    const u = await prisma.user.create({ data: { name: `${role} user`, email: `${role.toLowerCase()}@p.test`, passwordHash, role } });
    ids[role] = u.id;
    const res = await request(app).post(`${api}/auth/login`).send({ email: u.email, password: 'Password123!' });
    tokens[role] = res.body.accessToken;
  }
  await prisma.user.create({ data: { name: 'Gone', email: 'inactive@p.test', passwordHash, role: 'STAFF', isActive: false } });
  ids.category = (await prisma.category.create({ data: { name: 'Gadgets' } })).id;
  ids.supplier = (await prisma.supplier.create({ data: { name: 'Gadget Supply' } })).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('health', () => {
  it('reports database connectivity without leaking internals', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up', environment: 'test' });
    expect(JSON.stringify(res.body)).not.toMatch(/postgres|password|stockflow_test/i);
  });
});

describe('authentication', () => {
  it('logs in, returns an access token and an httpOnly refresh cookie', async () => {
    const res = await request(app).post(`${api}/auth/login`).send({ email: 'admin@p.test', password: 'Password123!' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'admin@p.test', role: 'ADMIN' });
    expect(res.body.user.passwordHash).toBeUndefined();
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/refreshToken=.*HttpOnly/i);
  });

  it('rejects wrong passwords and unknown emails with the same generic message', async () => {
    const wrong = await request(app).post(`${api}/auth/login`).send({ email: 'admin@p.test', password: 'nope-nope' });
    const unknown = await request(app).post(`${api}/auth/login`).send({ email: 'ghost@p.test', password: 'nope-nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('blocks deactivated users', async () => {
    const res = await request(app).post(`${api}/auth/login`).send({ email: 'inactive@p.test', password: 'Password123!' });
    expect(res.status).toBe(403);
  });

  it('rejects missing, tampered and expired tokens', async () => {
    expect((await request(app).get(`${api}/auth/me`)).status).toBe(401);
    const forged = jwt.sign({ sub: ids.ADMIN, role: 'ADMIN', email: 'admin@p.test' }, 'not-the-real-secret');
    expect((await request(app).get(`${api}/auth/me`).set({ Authorization: `Bearer ${forged}` })).status).toBe(401);
    const expired = jwt.sign({ sub: ids.ADMIN, role: 'ADMIN', email: 'admin@p.test' }, env.jwt.accessSecret, { expiresIn: -10 });
    expect((await request(app).get(`${api}/auth/me`).set({ Authorization: `Bearer ${expired}` })).status).toBe(401);
    const me = await request(app).get(`${api}/auth/me`).set(as('STAFF'));
    expect(me.body.user.role).toBe('STAFF');
  });

  it('refresh issues a new access token from the cookie', async () => {
    const login = await request(app).post(`${api}/auth/login`).send({ email: 'manager@p.test', password: 'Password123!' });
    const cookie = login.headers['set-cookie'];
    const res = await request(app).post(`${api}/auth/refresh`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect((await request(app).post(`${api}/auth/refresh`)).status).toBe(401);
  });

  it('public registration can be switched off (production default)', async () => {
    const original = env.allowRegistration;
    env.allowRegistration = false;
    try {
      const res = await request(app).post(`${api}/auth/register`).send({ name: 'Mallory', email: 'm@p.test', password: 'Password123!' });
      expect(res.status).toBe(403);
      expect(await prisma.user.count({ where: { email: 'm@p.test' } })).toBe(0);
    } finally {
      env.allowRegistration = original;
    }
  });
});

describe('RBAC', () => {
  it('enforces the role matrix', async () => {
    const product = { sku: 'RBAC-1', name: 'RBAC item', unitPrice: 10, costPrice: 5 };
    expect((await request(app).post(`${api}/products`).set(as('STAFF')).send(product)).status).toBe(403);
    expect((await request(app).post(`${api}/products`).set(as('MANAGER')).send(product)).status).toBe(201);
    expect((await request(app).get(`${api}/users`).set(as('MANAGER'))).status).toBe(403);
    expect((await request(app).get(`${api}/users`).set(as('ADMIN'))).status).toBe(200);
    expect((await request(app).get(`${api}/activity`).set(as('STAFF'))).status).toBe(403);
    expect((await request(app).get(`${api}/activity`).set(as('MANAGER'))).status).toBe(200);
    // Purchases add stock → manager+ only.
    const p = await prisma.product.findUniqueOrThrow({ where: { sku: 'RBAC-1' } });
    const po = { type: 'PURCHASE', supplierId: ids.supplier, items: [{ productId: p.id, quantity: 1 }] };
    expect((await request(app).post(`${api}/orders`).set(as('STAFF')).send(po)).status).toBe(403);
    expect((await request(app).post(`${api}/orders`).set(as('STAFF')).send({ ...po, status: 'PENDING' })).status).toBe(403);
  });
});

describe('products', () => {
  it('creates, updates, lists, searches and filters', async () => {
    const created = await request(app)
      .post(`${api}/products`)
      .set(as('MANAGER'))
      .send({ sku: 'PRD-1', name: 'Desk Lamp', unitPrice: 1299, costPrice: 700, quantityInStock: 10, reorderLevel: 3, categoryId: ids.category, supplierId: ids.supplier });
    expect(created.status).toBe(201);
    ids.lamp = created.body.data.id;

    const updated = await request(app).patch(`${api}/products/${ids.lamp}`).set(as('MANAGER')).send({ name: 'LED Desk Lamp', unitPrice: 1399 });
    expect(updated.body.data).toMatchObject({ name: 'LED Desk Lamp', unitPrice: '1399' });

    const search = await request(app).get(`${api}/products`).query({ search: 'led desk' }).set(as('STAFF'));
    expect(search.body.data.map((p: { sku: string }) => p.sku)).toEqual(['PRD-1']);
    const byCategory = await request(app).get(`${api}/products`).query({ categoryId: ids.category }).set(as('STAFF'));
    expect(byCategory.body.data.every((p: { categoryId: number }) => p.categoryId === ids.category)).toBe(true);
    const sorted = await request(app).get(`${api}/products`).query({ sort: 'unitPrice', order: 'desc' }).set(as('STAFF'));
    const prices = sorted.body.data.map((p: { unitPrice: string }) => Number(p.unitPrice));
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
  });

  it('rejects invalid product data', async () => {
    const bad = await request(app).post(`${api}/products`).set(as('MANAGER')).send({ sku: '', name: 'X', unitPrice: -5, costPrice: 'free', quantityInStock: 1.5 });
    expect(bad.status).toBe(400);
    const fields = bad.body.details.map((d: { path: string }) => d.path);
    expect(fields).toEqual(expect.arrayContaining(['sku', 'name', 'unitPrice', 'costPrice', 'quantityInStock']));
    expect((await request(app).post(`${api}/products`).set(as('MANAGER')).send({ sku: 'PRD-1', name: 'Dup', unitPrice: 1, costPrice: 1 })).status).toBe(409);
  });
});

describe('orders & inventory workflow', () => {
  it('rejects invalid quantities and products', async () => {
    for (const quantity of [0, -3, 1.5]) {
      const res = await request(app).post(`${api}/orders`).set(as('STAFF')).send({ type: 'SALE', items: [{ productId: ids.lamp, quantity }] });
      expect(res.status).toBe(400);
    }
    expect((await request(app).post(`${api}/orders`).set(as('STAFF')).send({ type: 'SALE', items: [{ productId: 999999, quantity: 1 }] })).status).toBe(400);
    expect((await request(app).post(`${api}/orders`).set(as('STAFF')).send({ type: 'REFUND', items: [{ productId: ids.lamp, quantity: 1 }] })).status).toBe(400);
    expect(await stockOf(ids.lamp)).toBe(10);
  });

  it('PENDING sale is a draft: no stock change until confirmed, then fulfilled', async () => {
    const draft = await request(app).post(`${api}/orders`).set(as('STAFF')).send({ type: 'SALE', status: 'PENDING', items: [{ productId: ids.lamp, quantity: 4 }] });
    expect(draft.status).toBe(201);
    expect(draft.body.data.status).toBe('PENDING');
    expect(await stockOf(ids.lamp)).toBe(10);
    expect(await prisma.stockMovement.count({ where: { referenceOrderId: draft.body.data.id } })).toBe(0);

    const confirmed = await request(app).patch(`${api}/orders/${draft.body.data.id}/status`).set(as('MANAGER')).send({ status: 'CONFIRMED' });
    expect(confirmed.status).toBe(200);
    expect(await stockOf(ids.lamp)).toBe(6);
    expect(await prisma.stockMovement.count({ where: { referenceOrderId: draft.body.data.id, changeQty: -4, reason: 'SALE' } })).toBe(1);

    const fulfilled = await request(app).patch(`${api}/orders/${draft.body.data.id}/status`).set(as('MANAGER')).send({ status: 'FULFILLED' });
    expect(fulfilled.body.data.status).toBe('FULFILLED');
    expect(await stockOf(ids.lamp)).toBe(6); // fulfilment doesn't move stock twice
    expect((await request(app).patch(`${api}/orders/${draft.body.data.id}/status`).set(as('MANAGER')).send({ status: 'CANCELLED' })).status).toBe(409);
  });

  it('a PENDING draft can be saved even if stock is short, but cannot be confirmed', async () => {
    const draft = await request(app).post(`${api}/orders`).set(as('STAFF')).send({ type: 'SALE', status: 'PENDING', items: [{ productId: ids.lamp, quantity: 50 }] });
    expect(draft.status).toBe(201);
    const confirm = await request(app).patch(`${api}/orders/${draft.body.data.id}/status`).set(as('MANAGER')).send({ status: 'CONFIRMED' });
    expect(confirm.status).toBe(409);
    expect(confirm.body.error).toBe('INSUFFICIENT_STOCK');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: draft.body.data.id } })).status).toBe('PENDING');
    expect(await stockOf(ids.lamp)).toBe(6);
  });

  it('cancelling a PENDING draft never "restores" stock that was never taken', async () => {
    const draft = await request(app).post(`${api}/orders`).set(as('STAFF')).send({ type: 'SALE', status: 'PENDING', items: [{ productId: ids.lamp, quantity: 2 }] });
    await request(app).patch(`${api}/orders/${draft.body.data.id}/status`).set(as('MANAGER')).send({ status: 'CANCELLED' });
    expect(await stockOf(ids.lamp)).toBe(6);
    expect(await prisma.stockMovement.count({ where: { referenceOrderId: draft.body.data.id } })).toBe(0);
  });

  it('purchase: PENDING draft → CONFIRMED adds stock; cancel removes it', async () => {
    const po = await request(app)
      .post(`${api}/orders`)
      .set(as('MANAGER'))
      .send({ type: 'PURCHASE', status: 'PENDING', supplierId: ids.supplier, items: [{ productId: ids.lamp, quantity: 20 }] });
    expect(po.body.data.totalAmount).toBe('14000'); // 20 × cost 700
    expect(await stockOf(ids.lamp)).toBe(6);
    await request(app).patch(`${api}/orders/${po.body.data.id}/status`).set(as('MANAGER')).send({ status: 'CONFIRMED' });
    expect(await stockOf(ids.lamp)).toBe(26);
    await request(app).patch(`${api}/orders/${po.body.data.id}/status`).set(as('MANAGER')).send({ status: 'CANCELLED' });
    expect(await stockOf(ids.lamp)).toBe(6);
  });

  it('confirmed sales decrease stock, never below zero; returns and adjustments are ledgered', async () => {
    const tooMany = await request(app).post(`${api}/orders`).set(as('STAFF')).send({ type: 'SALE', items: [{ productId: ids.lamp, quantity: 7 }] });
    expect(tooMany.status).toBe(409);
    const sale = await request(app).post(`${api}/orders`).set(as('STAFF')).send({ type: 'SALE', items: [{ productId: ids.lamp, quantity: 6 }] });
    expect(sale.status).toBe(201);
    expect(await stockOf(ids.lamp)).toBe(0);

    const ret = await request(app).post(`${api}/products/${ids.lamp}/adjust`).set(as('MANAGER')).send({ changeQty: 1, reason: 'RETURN', note: 'Customer return' });
    expect(ret.status).toBe(200);
    expect(await stockOf(ids.lamp)).toBe(1);
    expect((await request(app).post(`${api}/products/${ids.lamp}/adjust`).set(as('MANAGER')).send({ changeQty: -2 })).status).toBe(409);

    expect(await ledgerProblems()).toEqual([]);
  });
});

describe('customers', () => {
  it('stats count confirmed + fulfilled sales only (not drafts or cancellations); walk-ins are separate', async () => {
    const c = await request(app).post(`${api}/customers`).set(as('STAFF')).send({ name: 'Bright Office Co' });
    ids.cust = c.body.data.id;
    await prisma.product.update({ where: { id: ids.lamp }, data: { quantityInStock: 20 } });
    await prisma.stockMovement.create({ data: { productId: ids.lamp, changeQty: 19, reason: 'ADJUSTMENT', createdById: ids.ADMIN } });

    const sell = (body: Record<string, unknown>) =>
      request(app).post(`${api}/orders`).set(as('STAFF')).send({ type: 'SALE', items: [{ productId: ids.lamp, quantity: 1 }], ...body });
    const confirmed = await sell({ customerId: ids.cust }); // 1399
    const fulfilled = await sell({ customerId: ids.cust }); // 1399
    await request(app).patch(`${api}/orders/${fulfilled.body.data.id}/status`).set(as('MANAGER')).send({ status: 'FULFILLED' });
    await sell({ customerId: ids.cust, status: 'PENDING' }); // draft — excluded
    const cancelled = await sell({ customerId: ids.cust });
    await request(app).patch(`${api}/orders/${cancelled.body.data.id}/status`).set(as('MANAGER')).send({ status: 'CANCELLED' });
    await sell({}); // walk-in

    expect(confirmed.status).toBe(201);
    const detail = await request(app).get(`${api}/customers/${ids.cust}`).set(as('STAFF'));
    expect(detail.body.data.stats).toMatchObject({ orders: 2, totalSpent: 2798, avgOrderValue: 1399, unitsPurchased: 2 });
    expect(detail.body.data.orderCount).toBe(4);

    const list = await request(app).get(`${api}/customers`).query({ search: 'bright' }).set(as('STAFF'));
    expect(list.body.data).toHaveLength(1);
    expect(list.body.walkIn.orders).toBeGreaterThanOrEqual(1);

    const dash = await request(app).get(`${api}/dashboard/summary`).set(as('STAFF'));
    const revenue = await prisma.order.aggregate({ where: { type: 'SALE', status: { in: ['CONFIRMED', 'FULFILLED'] } }, _sum: { totalAmount: true } });
    expect(dash.body.data.salesRevenue).toBeCloseTo(Number(revenue._sum.totalAmount));
    expect(await ledgerProblems()).toEqual([]);
  });
});

describe('demo seed', () => {
  it('seeds a consistent demo dataset and is idempotent', async () => {
    await prisma.$executeRawUnsafe(TRUNCATE);
    const first = await seedDemoData();
    expect(first).toMatchObject({ users: 3, categories: 5, suppliers: 4, products: 18, customers: 5, transactions: 'created', skippedSteps: [] });

    const counts = async () => ({
      users: await prisma.user.count(),
      categories: await prisma.category.count(),
      suppliers: await prisma.supplier.count(),
      products: await prisma.product.count(),
      customers: await prisma.customer.count(),
      orders: await prisma.order.count(),
      movements: await prisma.stockMovement.count(),
    });
    const afterFirst = await counts();
    const second = await seedDemoData();
    expect(second.transactions).toBe('skipped (already seeded)');
    expect(await counts()).toEqual(afterFirst);

    // At least 5 sales, with the required mix of statuses and named customers.
    const sales = await prisma.order.findMany({ where: { type: 'SALE' }, include: { items: true } });
    expect(sales.length).toBeGreaterThanOrEqual(5);
    const statuses = new Set(sales.map((s) => s.status));
    for (const s of ['FULFILLED', 'CONFIRMED', 'PENDING', 'CANCELLED']) expect(statuses.has(s as never)).toBe(true);
    const names = new Set(sales.map((s) => s.customerName));
    for (const n of ['Tech Supplies', 'Stationary XYZ', 'Digital World', 'Office Essentials', 'Retail Hub']) expect(names.has(n)).toBe(true);
    expect(sales.some((s) => s.items.length > 1)).toBe(true);
    expect(await prisma.order.count({ where: { type: 'PURCHASE' } })).toBeGreaterThanOrEqual(3);

    // Money and stock integrity.
    for (const o of sales) {
      const sum = o.items.reduce((acc, i) => acc + Number(i.lineTotal), 0);
      expect(Number(o.totalAmount)).toBeCloseTo(sum);
      for (const i of o.items) expect(Number(i.lineTotal)).toBeCloseTo(Number(i.unitPrice) * i.quantity);
    }
    expect(await prisma.stockMovement.count({ where: { order: { status: 'PENDING' } } })).toBe(0);
    expect(await ledgerProblems()).toEqual([]);
    expect(await prisma.notification.count({ where: { type: 'LOW_STOCK' } })).toBeGreaterThan(0);

    // Demo users can sign in; passwords are hashed.
    const login = await request(app).post(`${api}/auth/login`).send({ email: 'staff@stockflow.dev', password: 'Password123!' });
    expect(login.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: 'staff@stockflow.dev' } })).passwordHash).toMatch(/^\$2[aby]\$12\$/);
  }, 60_000);
});
