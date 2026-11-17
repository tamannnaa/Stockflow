import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { DEMO_PASSWORD_DEFAULT, seedDemoData } from './demo';
import { describeTarget, resolveSeedPassword } from './guards';

/**
 * CLI entry for the demo seed.
 *   Local dev:   npm run seed              (Docker DB from server/.env; may use the local demo password)
 *   Neon:        npm run neon:seed         (server/.env.neon, via src/seed/neon.ts)
 *   Render:      npm run seed:prod         (compiled; uses Render's DATABASE_URL)
 *
 * Safety:
 *  - Production (NODE_ENV=production) requires SEED_DEMO_DATA=true.
 *  - Production and Neon require SEED_DEMO_PASSWORD (≥ 12 chars, not the public README password).
 *  - Existing users are never modified, so re-running never changes a password.
 *  - After seeding, the stock ledger is verified; a mismatch exits non-zero.
 */
async function main() {
  if (env.isProd && process.env.SEED_DEMO_DATA !== 'true') {
    throw new Error('Refusing to seed demo data in production. Set SEED_DEMO_DATA=true to seed a public demo deployment.');
  }
  const sharedDatabase = env.isProd || process.env.SEED_TARGET === 'neon';
  const password = resolveSeedPassword({
    provided: process.env.SEED_DEMO_PASSWORD,
    sharedDatabase,
    localDefault: DEMO_PASSWORD_DEFAULT,
  });

  const target = describeTarget(env.databaseUrl);
  console.log(`Seeding ${target.label} (${sharedDatabase ? 'shared/production database' : 'local development'})`);

  // Confirm the live connection really is the database we think it is.
  const [live] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  if (live.db !== target.database) {
    throw new Error(`Connected to database "${live.db}" but expected "${target.database}"`);
  }

  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) console.log(`  • ${existingUsers} user(s) already exist — they are left unchanged (passwords included)`);

  const summary = await seedDemoData({ password, log: (m) => console.log(`  • ${m}`) });

  // Ledger check: every product's stock must equal the sum of its movements
  // (opening stock is itself recorded as an ADJUSTMENT movement), and never be negative.
  const problems = await prisma.$queryRaw<{ sku: string; stock: number; ledger: number }[]>`
    SELECT p.sku, p.quantity_in_stock AS stock, COALESCE(SUM(m.change_qty), 0)::int AS ledger
    FROM products p LEFT JOIN stock_movements m ON m.product_id = p.id
    GROUP BY p.id
    HAVING p.quantity_in_stock <> COALESCE(SUM(m.change_qty), 0) OR p.quantity_in_stock < 0`;

  const counts = {
    users: await prisma.user.count(),
    categories: await prisma.category.count(),
    suppliers: await prisma.supplier.count(),
    products: await prisma.product.count(),
    customers: await prisma.customer.count(),
    orders: await prisma.order.count(),
    stockMovements: await prisma.stockMovement.count(),
  };
  console.log('\nSeed complete:', JSON.stringify({ ...summary, totals: counts }, null, 2));
  if (problems.length) {
    console.error('✖ Stock ledger mismatch:', problems);
    process.exitCode = 1;
    return;
  }
  console.log('✔ Stock ledger consistent for all products');
  console.log(
    `\nDemo logins: admin@stockflow.dev · manager@stockflow.dev · staff@stockflow.dev  (password: ${
      sharedDatabase ? 'the SEED_DEMO_PASSWORD you set' : DEMO_PASSWORD_DEFAULT
    })`,
  );
}

main()
  .catch((e) => {
    console.error(`\n✖ Seed failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
