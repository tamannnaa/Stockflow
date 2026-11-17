import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, FileText, Mail, MapPin, Pencil, Phone, Plus } from 'lucide-react';
import { customersApi } from '../../api/resources';
import { useAsync } from '../../hooks/useAsync';
import { count, date, money, relativeTime } from '../../lib/format';
import { Drawer } from '../../components/ui/Overlay';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States';
import { OrderStatusBadge } from '../../components/domain/Badges';
import type { Customer } from '../../types';

export function CustomerDrawer({
  id,
  version,
  onClose,
  onEdit,
}: {
  id: number | null;
  /** Bump to refetch after edits. */
  version: number;
  onClose: () => void;
  onEdit: (c: Customer) => void;
}) {
  const navigate = useNavigate();
  const { data, error, reload } = useAsync(() => (id ? customersApi.get(id).then((r) => r.data.data) : Promise.resolve(undefined)), [id, version]);
  if (!id) return null;
  const c = data && data.id === id ? data : undefined;

  return (
    <Drawer
      open
      onClose={onClose}
      title={c?.name ?? 'Customer'}
      subtitle={
        c && (
          <span className="flex flex-wrap items-center gap-2">
            {c.companyName && <span>{c.companyName}</span>}
            {!c.isActive && <Badge tone="neutral">Archived</Badge>}
            <span className="text-xs">Customer since {date(c.createdAt)}</span>
          </span>
        )
      }
      actions={
        c && (
          <>
            <Button size="sm" variant="secondary" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => onEdit(c)}>
              Edit
            </Button>
            {c.isActive && (
              <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => navigate(`/orders?type=SALE&new=1&customer=${c.id}`)}>
                New sale
              </Button>
            )}
          </>
        )
      }
    >
      {error && !c ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !c ? (
        <div className="space-y-3 p-5">
          <Skeleton className="h-20" />
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="space-y-6 p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Orders" value={count(c.stats.orders)} />
            <Stat label="Total spent" value={money(c.stats.totalSpent)} />
            <Stat label="Avg. order" value={c.stats.orders ? money(c.stats.avgOrderValue) : '—'} />
            <Stat label="Last order" value={c.stats.lastOrderAt ? relativeTime(c.stats.lastOrderAt) : '—'} />
          </div>
          <p className="-mt-3 text-xs text-ink-500">
            {count(c.stats.unitsPurchased)} units purchased. Statistics count confirmed and fulfilled orders only (not drafts or cancellations).
          </p>

          <ul className="space-y-2.5 rounded-xl border border-ink-200 p-4 text-sm">
            <Info icon={<Building2 />} label="Company" value={c.companyName} />
            <Info icon={<Mail />} label="Email" value={c.email && <a className="text-brand-700 hover:underline" href={`mailto:${c.email}`}>{c.email}</a>} />
            <Info icon={<Phone />} label="Phone" value={c.phone} />
            <Info icon={<FileText />} label="GSTIN" value={c.gstin && <span className="font-mono">{c.gstin}</span>} />
            <Info icon={<MapPin />} label="Address" value={c.address && <span className="whitespace-pre-line">{c.address}</span>} />
          </ul>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink-900">Order history</h3>
              {c.orderCount > c.orders.length && (
                <button className="text-xs font-medium text-brand-700 hover:underline" onClick={() => navigate(`/orders?type=SALE&customerId=${c.id}`)}>
                  View all {c.orderCount}
                </button>
              )}
            </div>
            {c.orders.length === 0 ? (
              <EmptyState title="No orders yet" description="Sales recorded for this customer will appear here." className="py-6" />
            ) : (
              <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
                {c.orders.map((o) => (
                  <li key={o.id}>
                    <button
                      onClick={() => navigate(`/orders?order=${o.id}`)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-ink-50"
                    >
                      <span className="min-w-0">
                        <span className="font-mono text-xs font-medium text-ink-900">{o.orderNumber}</span>
                        <span className="ml-2 text-xs text-ink-500">
                          {date(o.createdAt)} · {o._count.items} {o._count.items === 1 ? 'item' : 'items'}
                        </span>
                        {o.customerName && o.customerName !== c.name && (
                          <span className="block text-2xs text-ink-400">Recorded as “{o.customerName}”</span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <OrderStatusBadge status={o.status} />
                        <span className={o.status === 'CANCELLED' ? 'font-medium text-ink-400 line-through tabular' : 'font-medium text-ink-900 tabular'}>
                          {money(o.totalAmount)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-200 px-3 py-2.5">
      <p className="text-2xs font-medium uppercase tracking-wider text-ink-500">{label}</p>
      <p className="mt-1 truncate text-base font-semibold text-ink-900 tabular">{value}</p>
    </div>
  );
}

function Info({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 h-4 w-4 shrink-0 text-ink-400 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <span className="w-20 shrink-0 text-ink-500">{label}</span>
      <span className="min-w-0 text-ink-900">{value || <span className="text-ink-400">—</span>}</span>
    </li>
  );
}
