import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  IndianRupee,
  PackageCheck,
  PackageOpen,
  RotateCw,
  ShoppingCart,
  Truck,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, TooltipProps } from 'recharts';
import { dashboardApi } from '../api/resources';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../auth/AuthContext';
import { canManageInventory } from '../lib/permissions';
import { count, money, moneyCompact, pctChange, relativeTime } from '../lib/format';
import { PageHeader } from '../components/ui/PageHeader';
import { KpiCard } from '../components/ui/KpiCard';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { OrderStatusBadge, OrderTypeBadge, StockBadge } from '../components/domain/Badges';
import { chartTheme } from '../lib/theme';
import type { DashboardSummary, OrderStatus } from '../types';

// Chart colours come from the design tokens (src/styles/tokens.css).
const C = chartTheme();
const SALES = C.sales;
const PURCHASES = C.purchases;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsync(() => dashboardApi.summary().then((r) => r.data.data), []);
  const canManage = canManageInventory(user?.role);

  if (error && !data) {
    return (
      <Card>
        <ErrorState message={error} onRetry={reload} />
      </Card>
    );
  }

  const p = data?.period;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting()}, ${user?.name.split(' ')[0] ?? ''}`}
        description="Live inventory and order performance. Trends compare the last 30 days with the 30 days before."
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<RotateCw className="h-3.5 w-3.5" />} onClick={reload} loading={loading && !!data}>
              Refresh
            </Button>
            {canManage && (
              <Button size="sm" variant="secondary" icon={<Truck className="h-3.5 w-3.5" />} onClick={() => navigate('/orders?type=PURCHASE&new=1')}>
                New purchase order
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Revenue · last 30 days"
          icon={<IndianRupee />}
          loading={!data}
          value={data && money(p!.salesRevenue.current)}
          delta={data ? pctChange(p!.salesRevenue.current, p!.salesRevenue.previous) : undefined}
          deltaLabel="vs previous 30 days"
        />
        <KpiCard
          label="Sales orders · last 30 days"
          icon={<ShoppingCart />}
          tone="info"
          loading={!data}
          value={data && count(p!.salesOrders.current)}
          delta={data ? pctChange(p!.salesOrders.current, p!.salesOrders.previous) : undefined}
          deltaLabel="vs previous 30 days"
        />
        <KpiCard
          label="Inventory value (at cost)"
          icon={<PackageCheck />}
          tone="accent"
          loading={!data}
          value={data && money(data.stockValue)}
          context={data && <span>{count(data.totalUnits)} units across {count(data.totalProducts)} products · {moneyCompact(data.retailValue)} at retail</span>}
        />
        <KpiCard
          label="Stock alerts"
          icon={<AlertTriangle />}
          tone={data && data.outOfStockCount > 0 ? 'danger' : 'warning'}
          loading={!data}
          value={data && `${count(data.lowStockCount)} ${data.lowStockCount === 1 ? 'product' : 'products'}`}
          context={
            data && (
              <Link to="/products?stock=low" className="font-medium text-brand-700 hover:underline">
                {data.outOfStockCount} out of stock · review
              </Link>
            )
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Sales vs purchases"
            description="Daily value of confirmed and fulfilled orders"
            action={
              data && (
                <div className="flex gap-4 text-xs">
                  <LegendDot color={SALES} label="Sales" value={money(p!.salesRevenue.current)} />
                  <LegendDot color={PURCHASES} label="Purchases" value={money(p!.purchaseSpend.current)} />
                </div>
              )
            }
          />
          <div className="h-72 px-2 pb-3 pt-4">
            {!data ? <Skeleton className="mx-3 h-full" /> : <TrendChart data={data.dailySeries} />}
          </div>
        </Card>

        <Card>
          <CardHeader title="Inventory value by category" description="Stock on hand × cost price" />
          <div className="space-y-3.5 px-5 py-4">
            {!data ? (
              Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-8" />)
            ) : data.stockByCategory.length === 0 ? (
              <EmptyState title="No products yet" className="py-6" />
            ) : (
              <CategoryBars rows={data.stockByCategory} total={data.stockValue} />
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="Needs reordering"
            description="At or below reorder level"
            action={
              <Link to="/products?stock=low" className="text-xs font-medium text-brand-700 hover:underline">
                View all
              </Link>
            }
          />
          {!data ? (
            <ListSkeleton />
          ) : data.lowStockItems.length === 0 ? (
            <EmptyState icon={<PackageCheck className="h-5 w-5" />} title="Stock levels are healthy" description="Every product is above its reorder level." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {data.lowStockItems.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{item.name}</p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      <span className="tabular">{item.quantityInStock}</span> on hand · reorder at {item.reorderLevel}
                      {item.supplierName && <> · {item.supplierName}</>}
                    </p>
                  </div>
                  <StockBadge qty={item.quantityInStock} reorder={item.reorderLevel} />
                  {canManage && (
                    <Button
                      size="sm"
                      variant="subtle"
                      onClick={() =>
                        navigate(
                          `/orders?type=PURCHASE&new=1&product=${item.id}${item.supplierId ? `&supplier=${item.supplierId}` : ''}`,
                        )
                      }
                    >
                      Reorder
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent orders"
            action={
              <Link to="/orders" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
                All orders <ArrowRight className="h-3 w-3" />
              </Link>
            }
          />
          {!data ? (
            <ListSkeleton />
          ) : data.recentOrders.length === 0 ? (
            <EmptyState
              icon={<ShoppingCart className="h-5 w-5" />}
              title="No orders yet"
              description="Record your first sale to see it here."
              action={<Button size="sm" onClick={() => navigate('/orders?type=SALE&new=1')}>New sale</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-ink-100">
                  {data.recentOrders.map((o) => (
                    <tr key={o.id} className="cursor-pointer hover:bg-ink-50" onClick={() => navigate(`/orders?order=${o.id}`)}>
                      <td className="px-5 py-3">
                        <p className="font-mono text-xs font-medium text-ink-900">{o.orderNumber}</p>
                        <p className="mt-0.5 text-xs text-ink-500">{relativeTime(o.createdAt)}</p>
                      </td>
                      <td className="hidden px-3 py-3 sm:table-cell">
                        <OrderTypeBadge type={o.type} />
                      </td>
                      <td className="px-3 py-3 text-ink-600">
                        <span className="line-clamp-1">{o.type === 'SALE' ? o.customerName || 'Walk-in customer' : o.supplier?.name || '—'}</span>
                      </td>
                      <td className="hidden px-3 py-3 md:table-cell">
                        <OrderStatusBadge status={o.status} />
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-ink-900 tabular">{money(o.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Top products" description="By units sold, all time" />
          {!data ? (
            <ListSkeleton />
          ) : data.topProducts.length === 0 ? (
            <EmptyState icon={<PackageOpen className="h-5 w-5" />} title="No sales recorded yet" />
          ) : (
            <TopProducts rows={data.topProducts} />
          )}
        </Card>
        <Card>
          <CardHeader title="Order pipeline" description="All orders by status" />
          {!data ? <ListSkeleton /> : <Pipeline rows={data.statusBreakdown} />}
        </Card>
      </div>
    </div>
  );
}

function LegendDot({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} aria-hidden />
      <span className="text-ink-500">{label}</span>
      <span className="font-medium text-ink-900 tabular">{value}</span>
    </div>
  );
}

const shortDay = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

function TrendTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0]!.payload as DashboardSummary['dailySeries'][number];
  return (
    <div className="rounded-lg border border-ink-200 bg-surface px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-medium text-ink-900">{shortDay(String(label))}</p>
      <p className="flex items-center gap-1.5 text-ink-600">
        <span className="h-2 w-2 rounded-sm" style={{ background: SALES }} /> Sales <span className="ml-auto pl-4 font-medium text-ink-900 tabular">{money(row.sales)}</span>
      </p>
      <p className="flex items-center gap-1.5 text-ink-600">
        <span className="h-2 w-2 rounded-sm" style={{ background: PURCHASES }} /> Purchases <span className="ml-auto pl-4 font-medium text-ink-900 tabular">{money(row.purchases)}</span>
      </p>
      <p className="mt-1 text-ink-500">{row.orders} sales {row.orders === 1 ? 'order' : 'orders'}</p>
    </div>
  );
}

function TrendChart({ data }: { data: DashboardSummary['dailySeries'] }) {
  const empty = data.every((d) => d.sales === 0 && d.purchases === 0);
  if (empty) {
    return <EmptyState icon={<ShoppingCart className="h-5 w-5" />} title="No orders in the last 30 days" description="The trend fills in as sales and purchase orders are recorded." />;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="fillSales" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SALES} stopOpacity={0.18} />
            <stop offset="100%" stopColor={SALES} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="fillPurchases" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PURCHASES} stopOpacity={0.12} />
            <stop offset="100%" stopColor={PURCHASES} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fontSize: 11, fill: C.axis, fontFamily: 'var(--font-body)' }} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tickFormatter={(v) => moneyCompact(v)} tick={{ fontSize: 11, fill: C.axis, fontFamily: 'var(--font-body)' }} tickLine={false} axisLine={false} width={64} />
        <Tooltip content={<TrendTooltip />} cursor={{ stroke: C.cursor, strokeDasharray: '3 3' }} />
        <Area type="monotone" dataKey="purchases" stroke={PURCHASES} strokeWidth={2} fill="url(#fillPurchases)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: C.surface }} animationDuration={500} />
        <Area type="monotone" dataKey="sales" stroke={SALES} strokeWidth={2} fill="url(#fillSales)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: C.surface }} animationDuration={500} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function CategoryBars({ rows, total }: { rows: DashboardSummary['stockByCategory']; total: number }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <>
      {rows.map((r) => (
        <div key={r.category} title={`${r.category}: ${money(r.value)} · ${count(r.units)} units`}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate font-medium text-ink-700">{r.category}</span>
            <span className="shrink-0 text-ink-500 tabular">
              <span className="font-medium text-ink-900">{money(r.value)}</span>
              {total > 0 && <> · {Math.round((r.value / total) * 100)}%</>}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: SALES }} />
          </div>
          <p className="mt-1 text-2xs text-ink-400">
            {r.products} {r.products === 1 ? 'product' : 'products'} · {count(r.units)} units
          </p>
        </div>
      ))}
    </>
  );
}

function TopProducts({ rows }: { rows: DashboardSummary['topProducts'] }) {
  const max = Math.max(...rows.map((r) => r.unitsSold), 1);
  return (
    <ul className="divide-y divide-ink-100">
      {rows.map((r, i) => (
        <li key={r.id} className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3">
          <span className="text-xs font-medium text-ink-400 tabular">{i + 1}</span>
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-sm font-medium text-ink-900">{r.name}</p>
              <span className="shrink-0 text-xs text-ink-500 tabular">{count(r.unitsSold)} units</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100">
              <div className="h-full rounded-full" style={{ width: `${(r.unitsSold / max) * 100}%`, background: SALES }} />
            </div>
          </div>
          <span className="w-24 text-right text-sm font-medium text-ink-900 tabular">{money(r.revenue)}</span>
        </li>
      ))}
    </ul>
  );
}

const STATUSES: OrderStatus[] = ['CONFIRMED', 'FULFILLED', 'PENDING', 'CANCELLED'];

function Pipeline({ rows }: { rows: DashboardSummary['statusBreakdown'] }) {
  const get = (type: 'SALE' | 'PURCHASE', status: OrderStatus) => rows.find((r) => r.type === type && r.status === status)?.count ?? 0;
  const visible = STATUSES.filter((s) => get('SALE', s) + get('PURCHASE', s) > 0);
  if (visible.length === 0) return <EmptyState title="No orders yet" className="py-8" />;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-2xs uppercase tracking-wider text-ink-400">
          <th className="px-5 py-2 text-left font-semibold">Status</th>
          <th className="px-3 py-2 text-right font-semibold">Sales</th>
          <th className="px-5 py-2 text-right font-semibold">Purchases</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-ink-100">
        {visible.map((s) => (
          <tr key={s}>
            <td className="px-5 py-2.5">
              <OrderStatusBadge status={s} />
            </td>
            <td className="px-3 py-2.5 text-right font-medium text-ink-900 tabular">{get('SALE', s)}</td>
            <td className="px-5 py-2.5 text-right font-medium text-ink-900 tabular">{get('PURCHASE', s)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3 px-5 py-4">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-9" />
      ))}
    </div>
  );
}
