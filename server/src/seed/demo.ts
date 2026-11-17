import bcrypt from 'bcryptjs';
import type { UserRole } from '@prisma/client';
import { prisma } from '../config/prisma';
import { HttpError } from '../utils/httpError';
import { logActivity } from '../utils/activity';
import { productsService } from '../modules/products/products.service';
import { customersService } from '../modules/customers/customers.service';
import { ordersService } from '../modules/orders/orders.service';

/**
 * Idempotent demo data for StockFlow.
 *
 * Reference data (users, categories, suppliers, products, customers) is created
 * only when missing — re-running never duplicates rows or overwrites edits.
 *
 * Demo transactions (purchase orders, sales, adjustments, a return, a cancellation)
 * run ONCE, guarded by a `seed.demo_transactions` audit-log marker. They go through
 * the real services (ordersService / productsService), so stock levels, the
 * stock-movement ledger, low-stock notifications and the audit log are produced by
 * the same business logic as the app — the seed never sets stock quantities directly.
 */

export const DEMO_PASSWORD_DEFAULT = 'Password123!';
const SEED_MARKER = 'seed.demo_transactions';

const USERS: { email: string; name: string; role: UserRole }[] = [
  { email: 'admin@stockflow.dev', name: 'Priya Sharma', role: 'ADMIN' },
  { email: 'manager@stockflow.dev', name: 'Rahul Verma', role: 'MANAGER' },
  { email: 'staff@stockflow.dev', name: 'Ananya Iyer', role: 'STAFF' },
];

const CATEGORIES = [
  { name: 'Electronics', description: 'Computers, peripherals and power accessories' },
  { name: 'Accessories', description: 'Cables, hubs, stands and laptop accessories' },
  { name: 'Office Supplies', description: 'Paper, markers, staplers and desk essentials' },
  { name: 'Stationery', description: 'Notebooks, pens and writing supplies' },
  { name: 'Furniture', description: 'Office chairs and desks' },
];

const SUPPLIERS = [
  { name: 'Acme Distributors', email: 'sales@acme-distributors.example', phone: '+91 90000 00000', address: 'Plot 14, MIDC Industrial Area, Andheri East, Mumbai 400093' },
  { name: 'Nexus Electronics Pvt. Ltd.', email: 'procurement@nexus-electronics.example', phone: '+91 80 4123 5566', address: '3rd Floor, Prestige Tech Park, Outer Ring Road, Bengaluru 560103' },
  { name: 'Paperline Stationers', email: 'orders@paperline.example', phone: '+91 22 2678 4410', address: '22 Kalbadevi Road, Mumbai 400002' },
  { name: 'Woodcraft Office Furniture', email: 'sales@woodcraft-furniture.example', phone: '+91 20 2765 9012', address: 'Survey No. 45, Hinjewadi Phase 2, Pune 411057' },
];

type ProductSeed = {
  sku: string;
  name: string;
  description: string;
  category: string;
  supplier: string;
  unitPrice: number;
  costPrice: number;
  openingStock: number;
  reorderLevel: number;
};

// Prices in INR. Existing SKUs from the original seed (ELEC-001/002, STAT-001/002) are kept.
const PRODUCTS: ProductSeed[] = [
  { sku: 'ELEC-001', name: 'Wireless Mouse', description: '2.4 GHz optical mouse with silent clicks and 18-month battery life.', category: 'Electronics', supplier: 'Nexus Electronics Pvt. Ltd.', unitPrice: 799, costPrice: 450, openingStock: 40, reorderLevel: 10 },
  { sku: 'ELEC-002', name: 'USB-C Charger 65W', description: 'GaN fast charger with USB-C PD, compatible with most laptops and phones.', category: 'Electronics', supplier: 'Nexus Electronics Pvt. Ltd.', unitPrice: 1899, costPrice: 1100, openingStock: 25, reorderLevel: 10 },
  { sku: 'ELEC-003', name: 'Mechanical Keyboard', description: 'Full-size mechanical keyboard with brown switches and white backlight.', category: 'Electronics', supplier: 'Nexus Electronics Pvt. Ltd.', unitPrice: 3499, costPrice: 2200, openingStock: 18, reorderLevel: 6 },
  { sku: 'ELEC-004', name: '27" Full HD Monitor', description: '27-inch IPS monitor, 75 Hz, HDMI + DisplayPort, VESA mount.', category: 'Electronics', supplier: 'Nexus Electronics Pvt. Ltd.', unitPrice: 12999, costPrice: 9800, openingStock: 10, reorderLevel: 4 },
  { sku: 'ELEC-005', name: 'HD Webcam 1080p', description: '1080p webcam with dual noise-reducing microphones and privacy shutter.', category: 'Electronics', supplier: 'Nexus Electronics Pvt. Ltd.', unitPrice: 2499, costPrice: 1500, openingStock: 14, reorderLevel: 5 },
  { sku: 'ELEC-006', name: 'Noise-Cancelling Headset', description: 'USB headset with active noise cancellation for calls and meetings.', category: 'Electronics', supplier: 'Nexus Electronics Pvt. Ltd.', unitPrice: 4299, costPrice: 2800, openingStock: 12, reorderLevel: 5 },
  { sku: 'ACC-001', name: 'Aluminium Laptop Stand', description: 'Adjustable, foldable stand for 11"–17" laptops.', category: 'Accessories', supplier: 'Acme Distributors', unitPrice: 1499, costPrice: 850, openingStock: 22, reorderLevel: 8 },
  { sku: 'ACC-002', name: 'USB-C Hub 7-in-1', description: 'HDMI 4K, 3× USB-A, SD/microSD and 100 W pass-through charging.', category: 'Accessories', supplier: 'Acme Distributors', unitPrice: 2299, costPrice: 1400, openingStock: 16, reorderLevel: 6 },
  { sku: 'ACC-003', name: 'HDMI Cable 2 m', description: 'High-speed HDMI 2.0 cable, 4K@60 Hz, braided.', category: 'Accessories', supplier: 'Acme Distributors', unitPrice: 399, costPrice: 180, openingStock: 60, reorderLevel: 20 },
  { sku: 'ACC-004', name: 'Laptop Sleeve 15.6"', description: 'Water-resistant padded sleeve with accessory pocket.', category: 'Accessories', supplier: 'Acme Distributors', unitPrice: 899, costPrice: 480, openingStock: 20, reorderLevel: 8 },
  { sku: 'OFF-001', name: 'Heavy-Duty Stapler', description: 'Staples up to 100 sheets; includes 1,000 staples.', category: 'Office Supplies', supplier: 'Paperline Stationers', unitPrice: 449, costPrice: 240, openingStock: 30, reorderLevel: 10 },
  { sku: 'OFF-002', name: 'Whiteboard Markers (Pack of 4)', description: 'Low-odour dry-erase markers in black, blue, red and green.', category: 'Office Supplies', supplier: 'Paperline Stationers', unitPrice: 199, costPrice: 95, openingStock: 50, reorderLevel: 15 },
  { sku: 'OFF-003', name: 'A4 Copier Paper (500 sheets)', description: '75 GSM bright-white multipurpose paper, one ream.', category: 'Office Supplies', supplier: 'Paperline Stationers', unitPrice: 349, costPrice: 250, openingStock: 80, reorderLevel: 30 },
  { sku: 'OFF-004', name: 'Desk Organizer', description: 'Five-compartment mesh organizer for pens, notes and files.', category: 'Office Supplies', supplier: 'Paperline Stationers', unitPrice: 699, costPrice: 380, openingStock: 12, reorderLevel: 6 },
  { sku: 'STAT-001', name: 'A4 Notebook (Pack of 5)', description: 'Ruled, 160-page notebooks with a sturdy cover.', category: 'Stationery', supplier: 'Paperline Stationers', unitPrice: 299, costPrice: 160, openingStock: 120, reorderLevel: 25 },
  { sku: 'STAT-002', name: 'Gel Pens (Box of 20)', description: '0.5 mm smooth-flow gel pens, blue ink.', category: 'Stationery', supplier: 'Paperline Stationers', unitPrice: 349, costPrice: 190, openingStock: 40, reorderLevel: 20 },
  { sku: 'FURN-001', name: 'Ergonomic Office Chair', description: 'Mesh back, adjustable lumbar support, 3D armrests and recline lock.', category: 'Furniture', supplier: 'Woodcraft Office Furniture', unitPrice: 8999, costPrice: 6200, openingStock: 8, reorderLevel: 3 },
  { sku: 'FURN-002', name: 'Height-Adjustable Desk', description: 'Electric sit-stand desk, 140 × 70 cm, memory presets.', category: 'Furniture', supplier: 'Woodcraft Office Furniture', unitPrice: 18999, costPrice: 13500, openingStock: 4, reorderLevel: 2 },
];

// GSTINs follow the official format but are fictitious.
const CUSTOMERS = [
  { name: 'Tech Supplies', companyName: 'Tech Supplies Pvt. Ltd.', email: 'purchase@techsupplies.example', phone: '+91 98200 11223', address: '501 Mittal Tower, Nariman Point, Mumbai 400021', gstin: '27AAACT1234A1Z5' },
  { name: 'Stationary XYZ', companyName: 'Stationary XYZ Traders', email: 'accounts@stationaryxyz.example', phone: '+91 98450 22334', address: '18 Commercial Street, Bengaluru 560001', gstin: '29AABCS5678E1Z2' },
  { name: 'Digital World', companyName: 'Digital World Retail LLP', email: 'orders@digitalworld.example', phone: '+91 98110 33445', address: 'Shop 12, Nehru Place, New Delhi 110019', gstin: '07AAGCD4321K1Z9' },
  { name: 'Office Essentials', companyName: 'Office Essentials Co.', email: 'buying@officeessentials.example', phone: '+91 98250 44556', address: '7 C.G. Road, Navrangpura, Ahmedabad 380009', gstin: '24AAFCO8765L1ZX' },
  { name: 'Retail Hub', companyName: 'Retail Hub India Pvt. Ltd.', email: 'procurement@retailhub.example', phone: '+91 98400 55667', address: '42 Anna Salai, Chennai 600002', gstin: '33AAKCR2468M1Z4' },
];

type Line = [sku: string, quantity: number];
type DemoStep =
  | { kind: 'purchase'; daysAgo: number; supplier: string; lines: Line[]; status: 'PENDING' | 'CONFIRMED' | 'FULFILLED'; by: string }
  | { kind: 'sale'; daysAgo: number; customer: string | null; lines: Line[]; status: 'PENDING' | 'CONFIRMED' | 'FULFILLED' | 'CANCELLED'; by: string }
  | { kind: 'adjust'; daysAgo: number; sku: string; changeQty: number; reason: 'ADJUSTMENT' | 'RETURN'; note: string; by: string };

/** A month of activity, in chronological order. */
const STORY: DemoStep[] = [
  { kind: 'purchase', daysAgo: 27, supplier: 'Nexus Electronics Pvt. Ltd.', lines: [['ELEC-003', 10], ['ELEC-004', 6], ['ELEC-005', 8]], status: 'FULFILLED', by: 'manager@stockflow.dev' },
  { kind: 'purchase', daysAgo: 26, supplier: 'Paperline Stationers', lines: [['STAT-001', 100], ['STAT-002', 60], ['OFF-003', 120]], status: 'FULFILLED', by: 'manager@stockflow.dev' },
  { kind: 'sale', daysAgo: 24, customer: 'Tech Supplies', lines: [['ELEC-001', 10], ['ACC-002', 4], ['ELEC-003', 3]], status: 'FULFILLED', by: 'staff@stockflow.dev' },
  { kind: 'sale', daysAgo: 21, customer: 'Stationary XYZ', lines: [['STAT-001', 40], ['STAT-002', 25], ['OFF-002', 10]], status: 'FULFILLED', by: 'staff@stockflow.dev' },
  { kind: 'sale', daysAgo: 18, customer: 'Digital World', lines: [['ELEC-004', 3], ['ELEC-005', 4], ['ACC-003', 10]], status: 'FULFILLED', by: 'staff@stockflow.dev' },
  { kind: 'sale', daysAgo: 15, customer: 'Office Essentials', lines: [['FURN-001', 4], ['OFF-004', 6], ['OFF-001', 8]], status: 'FULFILLED', by: 'manager@stockflow.dev' },
  { kind: 'sale', daysAgo: 12, customer: 'Retail Hub', lines: [['ELEC-006', 5], ['ACC-001', 6]], status: 'CANCELLED', by: 'staff@stockflow.dev' },
  { kind: 'adjust', daysAgo: 10, sku: 'ACC-003', changeQty: -2, reason: 'ADJUSTMENT', note: 'Damaged in storage (cycle count)', by: 'manager@stockflow.dev' },
  { kind: 'purchase', daysAgo: 9, supplier: 'Woodcraft Office Furniture', lines: [['FURN-001', 6], ['FURN-002', 3]], status: 'CONFIRMED', by: 'manager@stockflow.dev' },
  { kind: 'sale', daysAgo: 7, customer: null, lines: [['ACC-003', 5], ['OFF-002', 6]], status: 'FULFILLED', by: 'staff@stockflow.dev' },
  { kind: 'sale', daysAgo: 5, customer: 'Tech Supplies', lines: [['ELEC-002', 18], ['ELEC-001', 5]], status: 'CONFIRMED', by: 'staff@stockflow.dev' },
  { kind: 'adjust', daysAgo: 4, sku: 'ELEC-001', changeQty: 2, reason: 'RETURN', note: 'Customer return — Tech Supplies, unopened', by: 'manager@stockflow.dev' },
  { kind: 'sale', daysAgo: 3, customer: 'Retail Hub', lines: [['ACC-004', 5], ['ELEC-006', 2]], status: 'PENDING', by: 'staff@stockflow.dev' },
  { kind: 'sale', daysAgo: 2, customer: 'Office Essentials', lines: [['OFF-003', 40], ['OFF-004', 4]], status: 'CONFIRMED', by: 'staff@stockflow.dev' },
  { kind: 'purchase', daysAgo: 1, supplier: 'Acme Distributors', lines: [['ACC-002', 10], ['ACC-004', 10]], status: 'PENDING', by: 'manager@stockflow.dev' },
];

export interface SeedSummary {
  users: number;
  categories: number;
  suppliers: number;
  products: number;
  customers: number;
  transactions: 'created' | 'skipped (already seeded)';
  ordersCreated: number;
  skippedSteps: string[];
  reconciledProducts: number;
}

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10 + (n % 7), (n * 13) % 60, 0, 0);
  return d;
};

/**
 * Runs `fn`, then moves every order / stock movement / audit / notification row it
 * created to `date` — so the demo month looks realistic on the dashboard. Only
 * timestamps change; quantities come from the services.
 */
async function at<T>(date: Date, fn: () => Promise<T>): Promise<T> {
  const [o, m, a, n] = await Promise.all([
    prisma.order.aggregate({ _max: { id: true } }),
    prisma.stockMovement.aggregate({ _max: { id: true } }),
    prisma.activityLog.aggregate({ _max: { id: true } }),
    prisma.notification.aggregate({ _max: { id: true } }),
  ]);
  const result = await fn();
  await prisma.$transaction([
    prisma.order.updateMany({ where: { id: { gt: o._max.id ?? 0 } }, data: { createdAt: date } }),
    prisma.stockMovement.updateMany({ where: { id: { gt: m._max.id ?? 0 } }, data: { createdAt: date } }),
    prisma.activityLog.updateMany({ where: { id: { gt: a._max.id ?? 0 } }, data: { createdAt: date } }),
    prisma.notification.updateMany({ where: { id: { gt: n._max.id ?? 0 } }, data: { createdAt: date } }),
  ]);
  return result;
}

export async function seedDemoData(opts: { password?: string; log?: (msg: string) => void } = {}): Promise<SeedSummary> {
  const log = opts.log ?? (() => undefined);
  const password = opts.password ?? DEMO_PASSWORD_DEFAULT;
  const skippedSteps: string[] = [];

  // ── Users (passwords hashed with bcrypt, same cost as the auth service) ──────
  const passwordHash = await bcrypt.hash(password, 12);
  const userIds: Record<string, number> = {};
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {}, // never reset an existing user's password or role
      create: { email: u.email, name: u.name, role: u.role, passwordHash },
    });
    userIds[u.email] = user.id;
  }
  const adminId = userIds['admin@stockflow.dev']!;
  log(`users: ${USERS.length}`);

  // ── Categories ───────────────────────────────────────────────────────────────
  const categoryIds: Record<string, number> = {};
  for (const c of CATEGORIES) {
    const existing = await prisma.category.findUnique({ where: { name: c.name } });
    const category = existing
      ? existing.description
        ? existing
        : await prisma.category.update({ where: { id: existing.id }, data: { description: c.description } })
      : await prisma.category.create({ data: c });
    categoryIds[c.name] = category.id;
  }

  // ── Suppliers (no unique column: matched by name, case-insensitive) ─────────
  const supplierIds: Record<string, number> = {};
  for (const s of SUPPLIERS) {
    const existing = await prisma.supplier.findFirst({ where: { name: { equals: s.name, mode: 'insensitive' } }, orderBy: { id: 'asc' } });
    if (existing) {
      // Fill in blank contact details only; never overwrite real edits.
      await prisma.supplier.update({
        where: { id: existing.id },
        data: { email: existing.email ?? s.email, phone: existing.phone ?? s.phone, address: existing.address ?? s.address },
      });
      supplierIds[s.name] = existing.id;
    } else {
      supplierIds[s.name] = (await prisma.supplier.create({ data: s })).id;
    }
  }

  // ── Products (new ones via productsService so opening stock hits the ledger) ─
  const productIds: Record<string, number> = {};
  await at(daysAgo(30), async () => {
    for (const p of PRODUCTS) {
      const existing = await prisma.product.findUnique({ where: { sku: p.sku } });
      if (existing) {
        productIds[p.sku] = existing.id;
        await prisma.product.update({
          where: { id: existing.id },
          data: {
            description: existing.description ?? p.description,
            categoryId: existing.categoryId ?? categoryIds[p.category],
            supplierId: existing.supplierId ?? supplierIds[p.supplier],
          },
        });
        continue;
      }
      const created = await productsService.create(
        {
          sku: p.sku,
          name: p.name,
          description: p.description,
          categoryId: categoryIds[p.category],
          supplierId: supplierIds[p.supplier],
          unitPrice: p.unitPrice,
          costPrice: p.costPrice,
          quantityInStock: p.openingStock,
          reorderLevel: p.reorderLevel,
        },
        adminId,
      );
      productIds[p.sku] = created.id;
    }
  });

  // ── Ledger reconciliation ────────────────────────────────────────────────────
  // Products created before the ledger existed (e.g. by an older seed) can have
  // stock without matching movements. Record the gap as an opening-balance
  // ADJUSTMENT so SUM(movements) always equals quantity_in_stock. Stock itself is
  // not changed.
  const gaps = await prisma.$queryRaw<{ id: number; sku: string; diff: number }[]>`
    SELECT p.id, p.sku, (p.quantity_in_stock - COALESCE(SUM(m.change_qty), 0))::int AS diff
    FROM products p
    LEFT JOIN stock_movements m ON m.product_id = p.id
    GROUP BY p.id
    HAVING p.quantity_in_stock <> COALESCE(SUM(m.change_qty), 0)`;
  await at(daysAgo(30), async () => {
    for (const g of gaps) {
      await prisma.stockMovement.create({ data: { productId: g.id, changeQty: g.diff, reason: 'ADJUSTMENT', createdById: adminId } });
      await logActivity(prisma, {
        userId: adminId,
        action: 'stock.adjusted',
        entity: 'product',
        entityId: g.id,
        metadata: { sku: g.sku, changeQty: g.diff, reason: 'ADJUSTMENT', note: 'Opening balance — ledger reconciliation' },
      });
    }
  });
  if (gaps.length) log(`reconciled ledger for ${gaps.length} product(s)`);

  // ── Customers (via customersService: validation + audit log) ─────────────────
  const customerIds: Record<string, number> = {};
  for (const c of CUSTOMERS) {
    const existing = await prisma.customer.findFirst({ where: { name: { equals: c.name, mode: 'insensitive' } }, orderBy: { id: 'asc' } });
    if (existing) {
      customerIds[c.name] = existing.id;
      // Fill blanks only, and skip unique-ish fields already used by another customer.
      const emailTaken = await prisma.customer.findFirst({ where: { email: c.email, id: { not: existing.id } } });
      const gstinTaken = await prisma.customer.findFirst({ where: { gstin: c.gstin, id: { not: existing.id } } });
      await prisma.customer.update({
        where: { id: existing.id },
        data: {
          companyName: existing.companyName ?? c.companyName,
          email: existing.email ?? (emailTaken ? null : c.email),
          phone: existing.phone ?? c.phone,
          address: existing.address ?? c.address,
          gstin: existing.gstin ?? (gstinTaken ? null : c.gstin),
          isActive: true,
        },
      });
    } else {
      customerIds[c.name] = (await customersService.create(c, adminId)).id;
    }
  }

  // ── Demo transactions — once only ────────────────────────────────────────────
  const alreadySeeded = await prisma.activityLog.findFirst({ where: { action: SEED_MARKER } });
  let ordersCreated = 0;
  if (!alreadySeeded) {
    for (const step of STORY) {
      const by = userIds[step.by]!;
      const label = step.kind === 'adjust' ? `${step.reason} ${step.sku}` : `${step.kind} (${step.kind === 'sale' ? step.customer ?? 'walk-in' : step.supplier})`;
      try {
        await at(daysAgo(step.daysAgo), async () => {
          if (step.kind === 'adjust') {
            await productsService.adjust(productIds[step.sku]!, { changeQty: step.changeQty, reason: step.reason, note: step.note }, by);
            return;
          }
          const order = await ordersService.create(by, {
            type: step.kind === 'sale' ? 'SALE' : 'PURCHASE',
            status: step.status === 'PENDING' ? 'PENDING' : 'CONFIRMED',
            supplierId: step.kind === 'purchase' ? supplierIds[step.supplier] : undefined,
            customerId: step.kind === 'sale' && step.customer ? customerIds[step.customer] : undefined,
            items: step.lines.map(([sku, quantity]) => ({ productId: productIds[sku]!, quantity })),
          });
          ordersCreated++;
          if (step.status === 'FULFILLED' || step.status === 'CANCELLED') {
            await ordersService.updateStatus(order.id, step.status, by);
          }
        });
      } catch (err) {
        // On a database with different existing stock, a step may not be possible
        // (e.g. not enough stock). Skip it rather than corrupting anything.
        if (err instanceof HttpError) {
          skippedSteps.push(`${label}: ${err.message}`);
          log(`skipped ${label}: ${err.message}`);
        } else {
          throw err;
        }
      }
    }
    await logActivity(prisma, { userId: adminId, action: SEED_MARKER, metadata: { orders: ordersCreated, skipped: skippedSteps.length } });
    log(`demo transactions: ${ordersCreated} orders`);
  } else {
    log('demo transactions already present — skipped');
  }

  return {
    users: USERS.length,
    categories: CATEGORIES.length,
    suppliers: SUPPLIERS.length,
    products: PRODUCTS.length,
    customers: CUSTOMERS.length,
    transactions: alreadySeeded ? 'skipped (already seeded)' : 'created',
    ordersCreated,
    skippedSteps,
    reconciledProducts: gaps.length,
  };
}
