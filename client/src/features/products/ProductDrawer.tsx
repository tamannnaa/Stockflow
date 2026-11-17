import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, SlidersHorizontal } from 'lucide-react';
import { productsApi } from '../../api/resources';
import { useAsync } from '../../hooks/useAsync';
import { dateTime, money, moneyPrecise } from '../../lib/format';
import { Drawer } from '../../components/ui/Overlay';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States';
import { MovementReasonBadge, QtyDelta, StockBadge } from '../../components/domain/Badges';
import type { Product, StockMovement } from '../../types';

export function ProductDrawer({
  product,
  canManage,
  onClose,
  onEdit,
  onAdjust,
  version,
}: {
  product: Product | null;
  canManage: boolean;
  onClose: () => void;
  onEdit: (p: Product) => void;
  onAdjust: (p: Product) => void;
  /** Bumped by the parent after an edit/adjustment so history reloads. */
  version: number;
}) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<StockMovement[]>([]);

  useEffect(() => {
    setPage(1);
    setRows([]);
  }, [product?.id, version]);

  const { data, loading, error, reload } = useAsync(
    () => (product ? productsApi.movements(product.id, { page, limit: 15 }).then((r) => r.data) : Promise.resolve(undefined)),
    [product?.id, page, version],
  );

  useEffect(() => {
    if (data) setRows((prev) => (data.pagination.page === 1 ? data.data : [...prev, ...data.data]));
  }, [data]);

  if (!product) return null;

  const unit = Number(product.unitPrice);
  const cost = Number(product.costPrice);
  const margin = unit > 0 ? ((unit - cost) / unit) * 100 : 0;

  return (
    <Drawer
      open
      onClose={onClose}
      title={product.name}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs">{product.sku}</span>
          <StockBadge qty={product.quantityInStock} reorder={product.reorderLevel} />
        </span>
      }
      actions={
        canManage && (
          <Button size="sm" variant="secondary" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => onEdit(product)}>
            Edit
          </Button>
        )
      }
    >
      <div className="space-y-6 p-5">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="On hand" value={String(product.quantityInStock)} />
          <Stat label="Reorder at" value={String(product.reorderLevel)} />
          <Stat label="Value at cost" value={money(product.quantityInStock * cost)} />
        </div>

        {canManage && (
          <Button variant="subtle" className="w-full justify-center" icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => onAdjust(product)}>
            Adjust stock
          </Button>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-ink-200 p-4 text-sm">
          <Detail label="Selling price" value={moneyPrecise(unit)} />
          <Detail label="Cost price" value={moneyPrecise(cost)} />
          <Detail label="Margin" value={`${margin.toFixed(1)}%`} />
          <Detail label="Category" value={product.category?.name ?? 'Uncategorized'} />
          <Detail
            label="Supplier"
            value={product.supplier ? <Link className="text-brand-700 hover:underline" to={`/suppliers?supplier=${product.supplier.id}`}>{product.supplier.name}</Link> : '—'}
          />
          {product.updatedAt && <Detail label="Last updated" value={dateTime(product.updatedAt)} />}
          {product.description && <Detail label="Description" value={product.description} wide />}
        </dl>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-900">Stock history</h3>
            {data && <span className="text-xs text-ink-500">{data.pagination.total} movements</span>}
          </div>
          {error && rows.length === 0 ? (
            <ErrorState message={error} onRetry={reload} />
          ) : loading && rows.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState title="No stock movements yet" description="Sales, purchases and adjustments will appear here." className="py-6" />
          ) : (
            <ol className="relative space-y-0 border-l border-ink-200 pl-4">
              {rows.map((m) => (
                <li key={m.id} className="relative pb-4 last:pb-0">
                  <span
                    className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${m.changeQty > 0 ? 'bg-success-500' : 'bg-danger-500'}`}
                    aria-hidden
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <MovementReasonBadge reason={m.reason} />
                        {m.order && (
                          <Link to={`/orders?order=${m.order.id}`} className="font-mono text-xs text-brand-700 hover:underline">
                            {m.order.orderNumber}
                          </Link>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-ink-500">
                        {dateTime(m.createdAt)} · {m.createdBy?.name ?? 'System'}
                      </p>
                    </div>
                    <QtyDelta value={m.changeQty} />
                  </div>
                </li>
              ))}
            </ol>
          )}
          {data && data.pagination.page < data.pagination.totalPages && (
            <Button variant="secondary" size="sm" className="mt-3 w-full justify-center" loading={loading} onClick={() => setPage((p) => p + 1)}>
              Load older movements
            </Button>
          )}
        </section>
      </div>
    </Drawer>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-200 px-3 py-2.5">
      <p className="text-2xs font-medium uppercase tracking-wider text-ink-500">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold text-ink-900 tabular">{value}</p>
    </div>
  );
}

function Detail({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink-900">{value}</dd>
    </div>
  );
}
