import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../app';
import { prisma } from '../config/prisma';

/**
 * End-to-end workflow tests against a real PostgreSQL test database.
 * Covers the stock-integrity guarantees, RBAC, ledger/audit writes and the
 * endpoints the redesigned UI depends on.
 */
const app = createApp();
const api = '/api/v1';
const tokens: Record<'ADMIN' | 'MANAGER' | 'STAFF', string> = { ADMIN: '', MANAGER: '', STAFF: '' };
const ids: Record<string, number> = {};

const as = (role: keyof typeof tokens) => ({ Authorization: `Bearer ${tokens[role]}` });
const stockOf = async (id: number) => (await prisma.product.findUniqueOrThrow({ where: { id } })).quantityInStock;

beforeAll(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE activity_logs, notifications, stock_movements, order_items, orders, customers, products, suppliers, categories, users RESTART IDENTITY CASCADE',
  );
  const passwordHash = await bcrypt.hash('Password123!', 4);
  for (const role of ['ADMIN', 'MANAGER', 'STAFF'] as const) {
    const user = await prisma.user.create({
      data: { name: `${role} user`, email: `${role.toLowerCase()}@test.dev`, passwordHash, role },
    });
    ids[role] = user.id;
    const res = await request(app).post(`${api}/auth/login`).send({ email: user.email, password: 'Password123!' });
    expect(res.status).toBe(200);
    tokens[role] = res.body.accessToken;
  }
  const cat = await prisma.category.create({ data: { name: 'Electronics' } });
  ids.category = cat.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('products', () => {
  it('creates a product and records opening stock in the ledger + audit log', async () => {
    const sup = await request(app).post(`${api}/suppliers`).set(as('MANAGER')).send({ name: 'Acme', email: 'a@acme.test' });
    expect(sup.status).toBe(201);
    ids.supplier = sup.body.data.id;

    const res = await request(app)
      .post(`${api}/products`)
      .set(as('MANAGER'))
      .send({ sku: 'MOUSE-1', name: 'Mouse', unitPrice: 799.5, costPrice: 450, quantityInStock: 10, reorderLevel: 5, categoryId: ids.category, supplierId: ids.supplier });
    expect(res.status).toBe(201);
    ids.mouse = res.body.data.id;

    const moves = await prisma.stockMovement.findMany({ where: { productId: ids.mouse } });
    expect(moves.map((m) => m.changeQty)).toEqual([10]);
    const log = await prisma.activityLog.findFirst({ where: { action: 'product.created', entityId: ids.mouse } });
    expect(log?.userId).toBe(ids.MANAGER);
  });

  it('rejects duplicate SKU with 409 and staff mutations with 403', async () => {
    const dup = await request(app).post(`${api}/products`).set(as('ADMIN')).send({ sku: 'MOUSE-1', name: 'Other', unitPrice: 1, costPrice: 1 });
    expect(dup.status).toBe(409);
    const staff = await request(app).post(`${api}/products/${ids.mouse}/adjust`).set(as('STAFF')).send({ changeQty: 5 });
    expect(staff.status).toBe(403);
  });

  it('returns 400 for a non-numeric id and 404 for a missing one', async () => {
    expect((await request(app).get(`${api}/products/abc`).set(as('STAFF'))).status).toBe(400);
    expect((await request(app).get(`${api}/products/99999`).set(as('STAFF'))).status).toBe(404);
  });

  it('adjusts stock with a ledger row and never below zero', async () => {
    const tooMuch = await request(app).post(`${api}/products/${ids.mouse}/adjust`).set(as('MANAGER')).send({ changeQty: -50 });
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body.error).toBe('INSUFFICIENT_STOCK');
    expect(await stockOf(ids.mouse)).toBe(10);

    const ok = await request(app).post(`${api}/products/${ids.mouse}/adjust`).set(as('MANAGER')).send({ changeQty: 5, note: 'Cycle count' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.quantityInStock).toBe(15);
    const last = await prisma.stockMovement.findFirst({ where: { productId: ids.mouse }, orderBy: { id: 'desc' } });
    expect(last).toMatchObject({ changeQty: 5, reason: 'ADJUSTMENT' });
  });

  it('records a ledger row when quantity is edited directly', async () => {
    const res = await request(app).patch(`${api}/products/${ids.mouse}`).set(as('MANAGER')).send({ quantityInStock: 12 });
    expect(res.status).toBe(200);
    const last = await prisma.stockMovement.findFirst({ where: { productId: ids.mouse }, orderBy: { id: 'desc' } });
    expect(last).toMatchObject({ changeQty: -3, reason: 'ADJUSTMENT' });
    // The ledger always sums to current stock.
    const sum = await prisma.stockMovement.aggregate({ where: { productId: ids.mouse }, _sum: { changeQty: true } });
    expect(sum._sum.changeQty).toBe(12);
  });

  it('filters by stock status using column comparison', async () => {
    const low = await prisma.product.create({ data: { sku: 'LOW-1', name: 'Low item', unitPrice: 10, costPrice: 5, quantityInStock: 2, reorderLevel: 5 } });
    const out = await prisma.product.create({ data: { sku: 'OUT-1', name: 'Out item', unitPrice: 10, costPrice: 5, quantityInStock: 0, reorderLevel: 5 } });
    const q = async (stock: string) =>
      (await request(app).get(`${api}/products`).query({ stock }).set(as('STAFF'))).body.data.map((p: { id: number }) => p.id);
    expect(await q('low')).toEqual([low.id]);
    expect(await q('out')).toEqual([out.id]);
    expect(await q('in')).toEqual([ids.mouse]);
  });
});

describe('orders', () => {
  it('creates a multi-line sale with exact decimal totals and a ledger entry', async () => {
    const cable = await prisma.product.create({ data: { sku: 'CABLE-1', name: 'Cable', unitPrice: 0.1, costPrice: 0.05, quantityInStock: 100, reorderLevel: 1 } });
    ids.cable = cable.id;
    const res = await request(app)
      .post(`${api}/orders`)
      .set(as('STAFF'))
      .send({ type: 'SALE', customerName: 'Globex', items: [{ productId: ids.mouse, quantity: 2 }, { productId: ids.cable, quantity: 3 }] });
    expect(res.status).toBe(201);
    expect(res.body.data.orderNumber).toBe('SO-000001');
    expect(res.body.data.totalAmount).toBe('1599.3'); // 2 × 799.50 + 3 × 0.10, no float drift
    ids.sale = res.body.data.id;
    expect(await stockOf(ids.mouse)).toBe(10);
    expect(await stockOf(ids.cable)).toBe(97);
  });

  it('rejects insufficient stock (409) and changes nothing', async () => {
    const before = await prisma.order.count();
    const res = await request(app).post(`${api}/orders`).set(as('STAFF')).send({ type: 'SALE', items: [{ productId: ids.mouse, quantity: 999 }] });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('INSUFFICIENT_STOCK');
    expect(await prisma.order.count()).toBe(before);
    expect(await stockOf(ids.mouse)).toBe(10);
  });

  it('rejects the same product twice in one order', async () => {
    const res = await request(app)
      .post(`${api}/orders`)
      .set(as('STAFF'))
      .send({ type: 'SALE', items: [{ productId: ids.mouse, quantity: 6 }, { productId: ids.mouse, quantity: 6 }] });
    expect(res.status).toBe(400);
    expect(await stockOf(ids.mouse)).toBe(10);
  });

  it('never oversells under concurrent sales', async () => {
    const p = await prisma.product.create({ data: { sku: 'RACE-1', name: 'Race item', unitPrice: 5, costPrice: 1, quantityInStock: 5, reorderLevel: 0 } });
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app).post(`${api}/orders`).set(as('STAFF')).send({ type: 'SALE', items: [{ productId: p.id, quantity: 2 }] }),
      ),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(2);
    expect(statuses.filter((s) => s === 409)).toHaveLength(3);
    expect(await stockOf(p.id)).toBe(1);
    const numbers = await prisma.order.findMany({ where: { type: 'SALE' }, select: { orderNumber: true } });
    expect(new Set(numbers.map((n) => n.orderNumber)).size).toBe(numbers.length);
  });

  it('creates a low-stock notification once, when the reorder level is crossed', async () => {
    await prisma.notification.deleteMany();
    const p = await prisma.product.create({ data: { sku: 'ALERT-1', name: 'Alert item', unitPrice: 5, costPrice: 1, quantityInStock: 10, reorderLevel: 5 } });
    const sell = (q: number) => request(app).post(`${api}/orders`).set(as('STAFF')).send({ type: 'SALE', items: [{ productId: p.id, quantity: q }] });
    await sell(4); // 6 left — above level
    await sell(2); // 4 left — crosses
    await sell(1); // 3 left — already low, no duplicate
    const notes = await request(app).get(`${api}/notifications`).set(as('STAFF'));
    expect(notes.body.data.filter((n: { message: string }) => n.message.includes('Alert item'))).toHaveLength(1);
    expect(notes.body.unread).toBe(1);
    await request(app).patch(`${api}/notifications/read-all`).set(as('STAFF'));
    expect((await request(app).get(`${api}/notifications`).set(as('STAFF'))).body.unread).toBe(0);
  });

  it('enforces the status workflow: staff 403, cancel restores stock, no double cancel', async () => {
    expect((await request(app).patch(`${api}/orders/${ids.sale}/status`).set(as('STAFF')).send({ status: 'CANCELLED' })).status).toBe(403);
    const cancel = await request(app).patch(`${api}/orders/${ids.sale}/status`).set(as('MANAGER')).send({ status: 'CANCELLED' });
    expect(cancel.status).toBe(200);
    expect(await stockOf(ids.mouse)).toBe(12);
    expect(await stockOf(ids.cable)).toBe(100);
    const again = await request(app).patch(`${api}/orders/${ids.sale}/status`).set(as('MANAGER')).send({ status: 'CANCELLED' });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('INVALID_TRANSITION');
  });

  it('handles purchase orders, and refuses to cancel one whose stock was already sold', async () => {
    const p = await prisma.product.create({ data: { sku: 'PO-ITEM', name: 'PO item', unitPrice: 20, costPrice: 8, quantityInStock: 0, reorderLevel: 1 } });
    const po = await request(app).post(`${api}/orders`).set(as('MANAGER')).send({ type: 'PURCHASE', supplierId: ids.supplier, items: [{ productId: p.id, quantity: 4 }] });
    expect(po.status).toBe(201);
    expect(po.body.data.orderNumber).toMatch(/^PO-/);
    expect(po.body.data.totalAmount).toBe('32');
    expect(await stockOf(p.id)).toBe(4);
    await request(app).post(`${api}/orders`).set(as('STAFF')).send({ type: 'SALE', items: [{ productId: p.id, quantity: 3 }] });
    const cancel = await request(app).patch(`${api}/orders/${po.body.data.id}/status`).set(as('MANAGER')).send({ status: 'CANCELLED' });
    expect(cancel.status).toBe(409);
    expect(cancel.body.error).toBe('STOCK_ALREADY_USED');
    expect(await stockOf(p.id)).toBe(1);
  });

  it('only managers and admins can create purchase orders', async () => {
    const res = await request(app).post(`${api}/orders`).set(as('STAFF')).send({ type: 'PURCHASE', items: [{ productId: ids.mouse, quantity: 1 }] });
    expect(res.status).toBe(403);
  });

  it('rejects an unknown supplier', async () => {
    const res = await request(app).post(`${api}/orders`).set(as('MANAGER')).send({ type: 'PURCHASE', supplierId: 9999, items: [{ productId: ids.mouse, quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  it('lists, searches and returns order detail with movements', async () => {
    const list = await request(app).get(`${api}/orders`).query({ search: 'globex' }).set(as('STAFF'));
    expect(list.body.data).toHaveLength(1);
    const detail = await request(app).get(`${api}/orders/${ids.sale}`).set(as('STAFF'));
    expect(detail.body.data.items).toHaveLength(2);
    expect(detail.body.data.movements.map((m: { reason: string }) => m.reason)).toEqual(['SALE', 'SALE', 'RETURN', 'RETURN']);
  });
});

describe('reporting & admin', () => {
  it('dashboard figures match the underlying orders', async () => {
    const res = await request(app).get(`${api}/dashboard/summary`).set(as('STAFF'));
    expect(res.status).toBe(200);
    const d = res.body.data;
    const agg = await prisma.order.aggregate({ where: { type: 'SALE', status: { not: 'CANCELLED' } }, _sum: { totalAmount: true }, _count: true });
    expect(d.salesRevenue).toBeCloseTo(Number(agg._sum.totalAmount));
    expect(d.salesOrders).toBe(agg._count);
    expect(d.period.salesRevenue.current).toBeCloseTo(Number(agg._sum.totalAmount));
    expect(d.dailySeries).toHaveLength(30);
    expect(d.outOfStockCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(d.stockByCategory)).toBe(true);
  });

  it('stock movements endpoint filters by reason', async () => {
    const res = await request(app).get(`${api}/stock-movements`).query({ reason: 'RETURN' }).set(as('STAFF'));
    expect(res.status).toBe(200);
    expect(res.body.data.every((m: { reason: string }) => m.reason === 'RETURN')).toBe(true);
    expect(res.body.data[0].product.sku).toBeDefined();
  });

  it('audit log is visible to managers, not staff', async () => {
    expect((await request(app).get(`${api}/activity`).set(as('STAFF'))).status).toBe(403);
    const res = await request(app).get(`${api}/activity`).query({ entity: 'order' }).set(as('MANAGER'));
    expect(res.status).toBe(200);
    expect(res.body.data.some((a: { action: string }) => a.action === 'order.status_changed')).toBe(true);
  });

  it('derives customers from sales orders', async () => {
    const res = await request(app).get(`${api}/customers`).set(as('STAFF'));
    expect(res.status).toBe(200);
    expect(res.body.walkIn.orders).toBeGreaterThan(0);
  });

  it('admin can create users but cannot lock themselves out; unknown id is 404', async () => {
    const created = await request(app).post(`${api}/users`).set(as('ADMIN')).send({ name: 'New Hire', email: 'new@test.dev', password: 'Password123!', role: 'STAFF' });
    expect(created.status).toBe(201);
    expect(created.body.data.passwordHash).toBeUndefined();
    const self = await request(app).patch(`${api}/users/${ids.ADMIN}`).set(as('ADMIN')).send({ isActive: false });
    expect(self.status).toBe(400);
    expect((await request(app).patch(`${api}/users/9999`).set(as('ADMIN')).send({ role: 'STAFF' })).status).toBe(404);
    expect((await request(app).get(`${api}/users`).set(as('MANAGER'))).status).toBe(403);
  });
});
