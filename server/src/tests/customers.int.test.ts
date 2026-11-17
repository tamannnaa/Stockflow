import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../app';
import { prisma } from '../config/prisma';

/** Customer management + its integration with sales orders, against a real test DB. */
const app = createApp();
const api = '/api/v1';
const tokens: Record<'ADMIN' | 'MANAGER' | 'STAFF', string> = { ADMIN: '', MANAGER: '', STAFF: '' };
const ids: Record<string, number> = {};
const as = (role: keyof typeof tokens) => ({ Authorization: `Bearer ${tokens[role]}` });

beforeAll(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE activity_logs, notifications, stock_movements, order_items, orders, customers, products, suppliers, categories, users RESTART IDENTITY CASCADE',
  );
  const passwordHash = await bcrypt.hash('Password123!', 4);
  for (const role of ['ADMIN', 'MANAGER', 'STAFF'] as const) {
    const u = await prisma.user.create({ data: { name: `${role} user`, email: `${role.toLowerCase()}@c.test`, passwordHash, role } });
    ids[role] = u.id;
    const res = await request(app).post(`${api}/auth/login`).send({ email: u.email, password: 'Password123!' });
    tokens[role] = res.body.accessToken;
  }
  const p = await prisma.product.create({ data: { sku: 'CUST-P1', name: 'Kettle', unitPrice: 1250.5, costPrice: 800, quantityInStock: 100, reorderLevel: 1 } });
  ids.product = p.id;
  const s = await prisma.supplier.create({ data: { name: 'Kettle Supply Co' } });
  ids.supplier = s.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

const sell = (body: Record<string, unknown>, role: keyof typeof tokens = 'STAFF') =>
  request(app).post(`${api}/orders`).set(as(role)).send({ type: 'SALE', items: [{ productId: ids.product, quantity: 2 }], ...body });

describe('customer CRUD', () => {
  it('validates input', async () => {
    const res = await request(app).post(`${api}/customers`).set(as('STAFF')).send({ name: 'A', email: 'nope', gstin: '123' });
    expect(res.status).toBe(400);
    const paths = res.body.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['name', 'email', 'gstin']));
  });

  it('creates a customer (staff allowed), normalises email/GSTIN, zero stats without division errors', async () => {
    const res = await request(app)
      .post(`${api}/customers`)
      .set(as('STAFF'))
      .send({ name: 'Riya Mehta', companyName: 'Mehta Traders', email: ' Riya@Mehta.TEST ', phone: '+91 98200 11223', gstin: '27aapfu0939f1zv', address: '' });
    expect(res.status).toBe(201);
    ids.riya = res.body.data.id;
    expect(res.body.data).toMatchObject({
      email: 'riya@mehta.test',
      gstin: '27AAPFU0939F1ZV',
      address: null,
      isActive: true,
      stats: { orders: 0, totalSpent: 0, avgOrderValue: 0, unitsPurchased: 0, lastOrderAt: null },
    });
    const log = await prisma.activityLog.findFirst({ where: { action: 'customer.created', entityId: ids.riya } });
    expect(log?.userId).toBe(ids.STAFF);
  });

  it('rejects duplicates: email, GSTIN, same name + company', async () => {
    const email = await request(app).post(`${api}/customers`).set(as('STAFF')).send({ name: 'Other', email: 'RIYA@mehta.test' });
    expect(email.status).toBe(409);
    expect(email.body.error).toBe('EMAIL_TAKEN');
    const gst = await request(app).post(`${api}/customers`).set(as('STAFF')).send({ name: 'Other', gstin: '27AAPFU0939F1ZV' });
    expect(gst.body.error).toBe('GSTIN_TAKEN');
    const dup = await request(app).post(`${api}/customers`).set(as('STAFF')).send({ name: 'riya mehta', companyName: 'MEHTA TRADERS' });
    expect(dup.body.error).toBe('CUSTOMER_EXISTS');
    // Same person name at a different company is allowed.
    const ok = await request(app).post(`${api}/customers`).set(as('STAFF')).send({ name: 'Riya Mehta', companyName: 'Blue Fern Cafe' });
    expect(ok.status).toBe(201);
    ids.riya2 = ok.body.data.id;
  });

  it('lists with search and pagination', async () => {
    await request(app).post(`${api}/customers`).set(as('STAFF')).send({ name: 'Arjun Rao', email: 'arjun@rao.test' });
    const all = await request(app).get(`${api}/customers`).query({ limit: 2 }).set(as('STAFF'));
    expect(all.body.pagination).toMatchObject({ total: 3, totalPages: 2, limit: 2 });
    expect(all.body.data.map((c: { name: string }) => c.name)).toEqual(['Arjun Rao', 'Riya Mehta']);
    const byCompany = await request(app).get(`${api}/customers`).query({ search: 'blue fern' }).set(as('STAFF'));
    expect(byCompany.body.data.map((c: { id: number }) => c.id)).toEqual([ids.riya2]);
    const byEmail = await request(app).get(`${api}/customers`).query({ search: 'rao.test' }).set(as('STAFF'));
    expect(byEmail.body.data).toHaveLength(1);
  });

  it('PUT replaces details (omitted optional fields are cleared)', async () => {
    const res = await request(app).put(`${api}/customers/${ids.riya2}`).set(as('STAFF')).send({ name: 'Riya M.', phone: '022 4000 1234' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: 'Riya M.', companyName: null, phone: '022 4000 1234' });
    expect((await request(app).put(`${api}/customers/9999`).set(as('STAFF')).send({ name: 'Ghost' })).status).toBe(404);
    expect((await request(app).get(`${api}/customers/abc`).set(as('STAFF'))).status).toBe(400);
  });
});

describe('sales order integration', () => {
  it('links a sale to a selected customer and snapshots the name', async () => {
    const res = await sell({ customerId: ids.riya });
    expect(res.status).toBe(201);
    ids.order1 = res.body.data.id;
    const o = await prisma.order.findUniqueOrThrow({ where: { id: ids.order1 } });
    expect(o).toMatchObject({ customerId: ids.riya, customerName: 'Riya Mehta' });
    // Stock logic unchanged: 2 units deducted with a SALE ledger row.
    expect((await prisma.product.findUniqueOrThrow({ where: { id: ids.product } })).quantityInStock).toBe(98);
    expect(await prisma.stockMovement.count({ where: { referenceOrderId: ids.order1, reason: 'SALE', changeQty: -2 } })).toBe(1);
  });

  it('computes stats with exact decimals and excludes cancelled orders', async () => {
    await sell({ customerId: ids.riya }); // second order
    const third = await sell({ customerId: ids.riya });
    await request(app).patch(`${api}/orders/${third.body.data.id}/status`).set(as('MANAGER')).send({ status: 'CANCELLED' });

    const res = await request(app).get(`${api}/customers/${ids.riya}`).set(as('STAFF'));
    expect(res.status).toBe(200);
    expect(res.body.data.stats).toMatchObject({ orders: 2, totalSpent: 5002, avgOrderValue: 2501, unitsPurchased: 4 });
    expect(res.body.data.orderCount).toBe(3); // cancelled order still linked (history)
    expect(res.body.data.orders).toHaveLength(3);
    expect(res.body.data.orders.map((o: { status: string }) => o.status)).toContain('CANCELLED');
  });

  it('renaming a customer does not rewrite historical orders', async () => {
    await request(app).put(`${api}/customers/${ids.riya}`).set(as('STAFF')).send({ name: 'Riya Mehta-Shah', email: 'riya@mehta.test' });
    const o = await prisma.order.findUniqueOrThrow({ where: { id: ids.order1 } });
    expect(o.customerName).toBe('Riya Mehta');
    const next = await sell({ customerId: ids.riya });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: next.body.data.id } })).customerName).toBe('Riya Mehta-Shah');
  });

  it('supports walk-in sales and reports them separately', async () => {
    const res = await sell({});
    expect(res.status).toBe(201);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: res.body.data.id } })).customerId).toBeNull();
    const list = await request(app).get(`${api}/customers`).set(as('STAFF'));
    expect(list.body.walkIn.orders).toBe(1);
  });

  it('legacy customerName: links case-insensitively, or creates the customer', async () => {
    const linked = await sell({ customerName: 'arjun rao' });
    const arjun = await prisma.customer.findFirstOrThrow({ where: { name: 'Arjun Rao' } });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: linked.body.data.id } })).customerId).toBe(arjun.id);

    const created = await sell({ customerName: 'Brand New Bistro' });
    expect(created.status).toBe(201);
    const bistro = await prisma.customer.findFirstOrThrow({ where: { name: 'Brand New Bistro' } });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: created.body.data.id } })).customerId).toBe(bistro.id);
  });

  it('purchase orders cannot have a customer and still use the supplier', async () => {
    const bad = await request(app)
      .post(`${api}/orders`)
      .set(as('MANAGER'))
      .send({ type: 'PURCHASE', supplierId: ids.supplier, customerId: ids.riya, items: [{ productId: ids.product, quantity: 1 }] });
    expect(bad.status).toBe(400);
    const ok = await request(app)
      .post(`${api}/orders`)
      .set(as('MANAGER'))
      .send({ type: 'PURCHASE', supplierId: ids.supplier, items: [{ productId: ids.product, quantity: 1 }] });
    expect(ok.status).toBe(201);
    const po = await prisma.order.findUniqueOrThrow({ where: { id: ok.body.data.id } });
    expect(po).toMatchObject({ customerId: null, supplierId: ids.supplier });
    // The database itself refuses a customer on a purchase order.
    await expect(prisma.$executeRawUnsafe(`UPDATE orders SET customer_id = ${ids.riya} WHERE id = ${po.id}`)).rejects.toThrow(
      /orders_customer_only_on_sales/,
    );
  });

  it('rejects unknown customers', async () => {
    expect((await sell({ customerId: 99999 })).status).toBe(400);
  });

  it('filters orders by customer', async () => {
    const res = await request(app).get(`${api}/orders`).query({ customerId: ids.riya }).set(as('STAFF'));
    expect(res.body.data).toHaveLength(4);
    expect(res.body.data.every((o: { customer: { id: number } }) => o.customer.id === ids.riya)).toBe(true);
  });
});

describe('archive and delete', () => {
  it('only managers can archive or delete', async () => {
    expect((await request(app).post(`${api}/customers/${ids.riya}/archive`).set(as('STAFF'))).status).toBe(403);
    expect((await request(app).delete(`${api}/customers/${ids.riya}`).set(as('STAFF'))).status).toBe(403);
  });

  it('refuses to delete a customer with orders; order history is untouched', async () => {
    const res = await request(app).delete(`${api}/customers/${ids.riya}`).set(as('MANAGER'));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CUSTOMER_HAS_ORDERS');
    expect(await prisma.order.count({ where: { customerId: ids.riya } })).toBe(4);
  });

  it('archives: hidden from the default list, blocked for new sales, restorable', async () => {
    const res = await request(app).post(`${api}/customers/${ids.riya}/archive`).set(as('MANAGER'));
    expect(res.body.data.isActive).toBe(false);
    const active = await request(app).get(`${api}/customers`).set(as('STAFF'));
    expect(active.body.data.find((c: { id: number }) => c.id === ids.riya)).toBeUndefined();
    const archived = await request(app).get(`${api}/customers`).query({ status: 'archived' }).set(as('STAFF'));
    expect(archived.body.data.map((c: { id: number }) => c.id)).toEqual([ids.riya]);
    expect((await sell({ customerId: ids.riya })).status).toBe(400);
    const restored = await request(app).post(`${api}/customers/${ids.riya}/restore`).set(as('MANAGER'));
    expect(restored.body.data.isActive).toBe(true);
    expect((await sell({ customerId: ids.riya })).status).toBe(201);
  });

  it('deletes a customer with no orders', async () => {
    const res = await request(app).delete(`${api}/customers/${ids.riya2}`).set(as('MANAGER'));
    expect(res.status).toBe(204);
    expect(await prisma.customer.findUnique({ where: { id: ids.riya2 } })).toBeNull();
    expect(await prisma.activityLog.count({ where: { action: 'customer.deleted', entityId: ids.riya2 } })).toBe(1);
  });

  it('sorts by total spent', async () => {
    const res = await request(app).get(`${api}/customers`).query({ sort: 'totalSpent', order: 'desc' }).set(as('STAFF'));
    const spent = res.body.data.map((c: { stats: { totalSpent: number } }) => c.stats.totalSpent);
    expect(spent).toEqual([...spent].sort((a, b) => b - a));
    expect(res.body.data[0].id).toBe(ids.riya);
  });
});
