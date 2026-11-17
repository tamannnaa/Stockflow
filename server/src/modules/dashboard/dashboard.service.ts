import { prisma } from '../../config/prisma';

const num = (v: unknown) => Number(v ?? 0);

/**
 * Dashboard KPIs. Uses raw parameterized SQL for the aggregates — this is where
 * SQL is clearer and faster than an ORM. Every figure is computed from live data;
 * period comparisons are "last 30 days" vs "the 30 days before that".
 */
export const dashboardService = {
  async summary() {
    const [
      [totals],
      [sales],
      [period],
      topProducts,
      salesTrend,
      dailySeries,
      stockByCategory,
      statusBreakdown,
      lowStockItems,
      recentOrders,
    ] = await Promise.all([
      prisma.$queryRaw<
        {
          totalProducts: bigint;
          lowStockCount: bigint;
          outOfStockCount: bigint;
          totalUnits: bigint;
          stockValue: unknown;
          retailValue: unknown;
        }[]
      >`
        SELECT
          COUNT(*)                                                    AS "totalProducts",
          COUNT(*) FILTER (WHERE quantity_in_stock <= reorder_level)  AS "lowStockCount",
          COUNT(*) FILTER (WHERE quantity_in_stock <= 0)              AS "outOfStockCount",
          COALESCE(SUM(quantity_in_stock), 0)                         AS "totalUnits",
          COALESCE(SUM(quantity_in_stock * cost_price), 0)            AS "stockValue",
          COALESCE(SUM(quantity_in_stock * unit_price), 0)            AS "retailValue"
        FROM products
        WHERE is_active = true`,

      prisma.$queryRaw<{ salesOrders: bigint; salesRevenue: unknown }[]>`
        SELECT COUNT(*) AS "salesOrders", COALESCE(SUM(total_amount), 0) AS "salesRevenue"
        FROM orders
        WHERE type = 'SALE' AND status IN ('CONFIRMED', 'FULFILLED')`,

      prisma.$queryRaw<
        {
          salesCurrent: unknown;
          salesPrevious: unknown;
          salesOrdersCurrent: bigint;
          salesOrdersPrevious: bigint;
          purchasesCurrent: unknown;
          purchasesPrevious: unknown;
          purchaseOrdersCurrent: bigint;
          purchaseOrdersPrevious: bigint;
        }[]
      >`
        SELECT
          COALESCE(SUM(total_amount) FILTER (WHERE type = 'SALE' AND created_at >= now() - interval '30 days'), 0)     AS "salesCurrent",
          COALESCE(SUM(total_amount) FILTER (WHERE type = 'SALE' AND created_at <  now() - interval '30 days'), 0)     AS "salesPrevious",
          COUNT(*) FILTER (WHERE type = 'SALE' AND created_at >= now() - interval '30 days')                           AS "salesOrdersCurrent",
          COUNT(*) FILTER (WHERE type = 'SALE' AND created_at <  now() - interval '30 days')                           AS "salesOrdersPrevious",
          COALESCE(SUM(total_amount) FILTER (WHERE type = 'PURCHASE' AND created_at >= now() - interval '30 days'), 0) AS "purchasesCurrent",
          COALESCE(SUM(total_amount) FILTER (WHERE type = 'PURCHASE' AND created_at <  now() - interval '30 days'), 0) AS "purchasesPrevious",
          COUNT(*) FILTER (WHERE type = 'PURCHASE' AND created_at >= now() - interval '30 days')                       AS "purchaseOrdersCurrent",
          COUNT(*) FILTER (WHERE type = 'PURCHASE' AND created_at <  now() - interval '30 days')                       AS "purchaseOrdersPrevious"
        FROM orders
        WHERE status IN ('CONFIRMED', 'FULFILLED') AND created_at >= now() - interval '60 days'`,

      // Top 5 products by units sold (join orders + order_items).
      prisma.$queryRaw<{ id: number; name: string; sku: string; unitsSold: number; revenue: unknown }[]>`
        SELECT p.id, p.name, p.sku, SUM(oi.quantity)::int AS "unitsSold",
               SUM(oi.line_total) AS "revenue"
        FROM order_items oi
        JOIN orders o   ON o.id = oi.order_id AND o.type = 'SALE' AND o.status IN ('CONFIRMED', 'FULFILLED')
        JOIN products p ON p.id = oi.product_id
        GROUP BY p.id, p.name, p.sku
        ORDER BY "unitsSold" DESC
        LIMIT 5`,

      // Kept for backwards compatibility: 14-day sales trend.
      prisma.$queryRaw<{ day: string; revenue: unknown }[]>`
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
               SUM(total_amount) AS revenue
        FROM orders
        WHERE type = 'SALE' AND status IN ('CONFIRMED', 'FULFILLED')
          AND created_at >= now() - interval '14 days'
        GROUP BY 1 ORDER BY 1`,

      // 30 contiguous days (zero-filled) of sales vs purchases for the trend chart.
      prisma.$queryRaw<{ day: string; sales: unknown; purchases: unknown; orders: bigint }[]>`
        SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
               COALESCE(SUM(o.total_amount) FILTER (WHERE o.type = 'SALE'), 0)     AS sales,
               COALESCE(SUM(o.total_amount) FILTER (WHERE o.type = 'PURCHASE'), 0) AS purchases,
               COUNT(o.id) FILTER (WHERE o.type = 'SALE')                          AS orders
        FROM generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') AS d(day)
        LEFT JOIN orders o
          ON date_trunc('day', o.created_at) = d.day AND o.status IN ('CONFIRMED', 'FULFILLED')
        GROUP BY d.day
        ORDER BY d.day`,

      prisma.$queryRaw<{ category: string; products: number; units: unknown; value: unknown }[]>`
        SELECT COALESCE(c.name, 'Uncategorized') AS category,
               COUNT(p.id)::int AS products,
               COALESCE(SUM(p.quantity_in_stock), 0) AS units,
               COALESCE(SUM(p.quantity_in_stock * p.cost_price), 0) AS value
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = true
        GROUP BY c.name
        ORDER BY value DESC`,

      prisma.order.groupBy({ by: ['type', 'status'], _count: { _all: true } }),

      prisma.$queryRaw<
        { id: number; sku: string; name: string; quantityInStock: number; reorderLevel: number; supplierId: number | null; supplierName: string | null }[]
      >`
        SELECT p.id, p.sku, p.name, p.quantity_in_stock AS "quantityInStock", p.reorder_level AS "reorderLevel",
               s.id AS "supplierId", s.name AS "supplierName"
        FROM products p
        LEFT JOIN suppliers s ON s.id = p.supplier_id
        WHERE p.is_active = true AND p.quantity_in_stock <= p.reorder_level
        ORDER BY p.quantity_in_stock::float / GREATEST(p.reorder_level, 1) ASC, p.name
        LIMIT 6`,

      prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 6,
        include: {
          createdBy: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
    ]);

    return {
      // Original fields (unchanged contract)
      totalProducts: num(totals.totalProducts),
      lowStockCount: num(totals.lowStockCount),
      stockValue: num(totals.stockValue),
      salesOrders: num(sales.salesOrders),
      salesRevenue: num(sales.salesRevenue),
      topProducts: topProducts.map((p) => ({ ...p, revenue: num(p.revenue) })),
      salesTrend: salesTrend.map((d) => ({ day: d.day, revenue: num(d.revenue) })),
      // Extended analytics
      outOfStockCount: num(totals.outOfStockCount),
      totalUnits: num(totals.totalUnits),
      retailValue: num(totals.retailValue),
      period: {
        days: 30,
        salesRevenue: { current: num(period.salesCurrent), previous: num(period.salesPrevious) },
        salesOrders: { current: num(period.salesOrdersCurrent), previous: num(period.salesOrdersPrevious) },
        purchaseSpend: { current: num(period.purchasesCurrent), previous: num(period.purchasesPrevious) },
        purchaseOrders: { current: num(period.purchaseOrdersCurrent), previous: num(period.purchaseOrdersPrevious) },
      },
      dailySeries: dailySeries.map((d) => ({
        day: d.day,
        sales: num(d.sales),
        purchases: num(d.purchases),
        orders: num(d.orders),
      })),
      stockByCategory: stockByCategory.map((c) => ({ ...c, units: num(c.units), value: num(c.value) })),
      statusBreakdown: statusBreakdown.map((s) => ({ type: s.type, status: s.status, count: s._count._all })),
      lowStockItems,
      recentOrders,
    };
  },
};
