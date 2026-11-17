import { afterAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../config/prisma';
import { ordersService } from '../modules/orders/orders.service';
import { seedDemoData } from '../seed/demo';

/**
 * Production safety: if the seed is interrupted part-way (e.g. a dropped
 * connection to Neon), re-running it must finish the job without duplicating
 * a single order, stock movement or user.
 */
const TRUNCATE =
  'TRUNCATE activity_logs, notifications, stock_movements, order_items, orders, customers, products, suppliers, categories, users RESTART IDENTITY CASCADE';

afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.$disconnect();
});

describe('demo seed — interrupted run', () => {
  it('resumes after a crash between creating an order and fulfilling it, with no duplicates', async () => {
    await prisma.$executeRawUnsafe(TRUNCATE);

    // Simulate a crash on the 3rd status update (the run dies right after an order was created).
    const real = ordersService.updateStatus.bind(ordersService);
    let calls = 0;
    const spy = vi.spyOn(ordersService, 'updateStatus').mockImplementation(async (...args) => {
      calls++;
      if (calls === 3) throw new Error('simulated network drop');
      return real(...args);
    });
    await expect(seedDemoData()).rejects.toThrow('simulated network drop');
    spy.mockRestore();

    const ordersAfterCrash = await prisma.order.count();
    expect(ordersAfterCrash).toBeGreaterThan(0);
    expect(await prisma.activityLog.count({ where: { action: 'seed.demo_transactions' } })).toBe(0);

    // Re-run: completes the half-done step and the rest, without re-creating orders.
    const resumed = await seedDemoData();
    expect(resumed.skippedSteps).toEqual([]);
    expect(await prisma.order.count()).toBe(13);
    expect(await prisma.user.count()).toBe(3);
    expect(await prisma.product.count()).toBe(18);

    // The interrupted order still reached its intended status.
    expect(await prisma.order.count({ where: { status: 'FULFILLED' } })).toBe(7);
    expect(await prisma.order.count({ where: { status: 'CANCELLED' } })).toBe(1);

    // Ledger: one stock movement per order line actually applied, and SUM(ledger) = stock.
    const bad = await prisma.$queryRaw<unknown[]>`
      SELECT p.id FROM products p LEFT JOIN stock_movements m ON m.product_id = p.id
      GROUP BY p.id HAVING p.quantity_in_stock <> COALESCE(SUM(m.change_qty), 0) OR p.quantity_in_stock < 0`;
    expect(bad).toEqual([]);

    // A third run is a no-op.
    const before = await prisma.stockMovement.count();
    const third = await seedDemoData();
    expect(third.transactions).toBe('skipped (already seeded)');
    expect(await prisma.stockMovement.count()).toBe(before);
    expect(await prisma.order.count()).toBe(13);
  }, 90_000);
});
