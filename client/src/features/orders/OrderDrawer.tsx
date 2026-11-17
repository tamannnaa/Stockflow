import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, CircleCheck, XCircle } from 'lucide-react';
import { ordersApi } from '../../api/resources';
import { useAsync } from '../../hooks/useAsync';
import { getErrorMessage } from '../../lib/errors';
import { dateTime, money, moneyPrecise } from '../../lib/format';
import { Drawer, ConfirmDialog } from '../../components/ui/Overlay';
import { Button } from '../../components/ui/Button';
import { ErrorState, Skeleton } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import { MovementReasonBadge, OrderStatusBadge, OrderTypeBadge, QtyDelta } from '../../components/domain/Badges';
import type { OrderDetail, OrderStatus } from '../../types';

type Action = 'CONFIRMED' | 'FULFILLED' | 'CANCELLED';

export function OrderDrawer({
  orderId,
  canChangeStatus,
  onClose,
  onChanged,
}: {
  orderId: number | null;
  canChangeStatus: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(
    () => (orderId ? ordersApi.get(orderId).then((r) => r.data.data) : Promise.resolve(undefined)),
    [orderId],
  );
  const [pending, setPending] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);

  if (!orderId) return null;
  const order = data && data.id === orderId ? data : undefined;

  const run = async (status: Action) => {
    if (!order) return;
    setBusy(true);
    try {
      await ordersApi.updateStatus(order.id, status);
      toast.success(
        status === 'CANCELLED' ? 'Order cancelled' : status === 'FULFILLED' ? 'Order fulfilled' : 'Order confirmed',
        status === 'CANCELLED' ? `${order.orderNumber} · stock has been reversed` : order.orderNumber,
      );
      setPending(null);
      reload();
      onChanged();
    } catch (err) {
      toast.error('Status not changed', getErrorMessage(err));
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  const actions = order && canChangeStatus && availableActions(order.status);

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        title={order ? <span className="font-mono">{order.orderNumber}</span> : 'Order'}
        subtitle={
          order && (
            <span className="flex flex-wrap items-center gap-2">
              <OrderTypeBadge type={order.type} />
              <OrderStatusBadge status={order.status} />
              <span className="text-xs">{dateTime(order.createdAt)}</span>
            </span>
          )
        }
      >
        {error && !order ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !order ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-20" />
            <Skeleton className="h-40" />
          </div>
        ) : (
          <div className={loading ? 'opacity-60' : undefined}>
            <div className="space-y-6 p-5">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-ink-200 p-4 text-sm">
                <div>
                  <dt className="text-xs text-ink-500">{order.type === 'SALE' ? 'Customer' : 'Supplier'}</dt>
                  <dd className="mt-0.5 font-medium text-ink-900">
                    {order.type === 'SALE' ? (
                      order.customer ? (
                        <Link to={`/customers?customer=${order.customer.id}`} className="text-brand-700 hover:underline">
                          {order.customerName || order.customer.name}
                        </Link>
                      ) : (
                        order.customerName || 'Walk-in customer'
                      )
                    ) : (
                      order.supplier?.name || '—'
                    )}
                  </dd>
                  {order.customer && order.customerName && order.customer.name !== order.customerName && (
                    <dd className="mt-0.5 text-xs text-ink-500">Now listed as {order.customer.name}</dd>
                  )}
                </div>
                <div>
                  <dt className="text-xs text-ink-500">Created by</dt>
                  <dd className="mt-0.5 font-medium text-ink-900">{order.createdBy?.name ?? '—'}</dd>
                </div>
                {order.type === 'PURCHASE' && order.supplier?.email && (
                  <div className="col-span-2">
                    <dt className="text-xs text-ink-500">Supplier contact</dt>
                    <dd className="mt-0.5 text-ink-900">
                      {order.supplier.email}
                      {order.supplier.phone && ` · ${order.supplier.phone}`}
                    </dd>
                  </div>
                )}
              </dl>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-ink-900">Items</h3>
                <div className="overflow-hidden rounded-xl border border-ink-200">
                  <table className="w-full text-sm">
                    <thead className="bg-ink-50 text-2xs uppercase tracking-wider text-ink-500">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Product</th>
                        <th className="px-3 py-2 text-right font-semibold">Qty</th>
                        <th className="hidden px-3 py-2 text-right font-semibold sm:table-cell">Unit</th>
                        <th className="px-3 py-2 text-right font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {order.items.map((it) => (
                        <tr key={it.id}>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-ink-900">{it.product.name}</p>
                            <p className="font-mono text-xs text-ink-500">{it.product.sku}</p>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular">{it.quantity}</td>
                          <td className="hidden px-3 py-2.5 text-right text-ink-600 tabular sm:table-cell">{moneyPrecise(it.unitPrice)}</td>
                          <td className="px-3 py-2.5 text-right font-medium text-ink-900 tabular">{moneyPrecise(it.lineTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-ink-200 bg-ink-50/60">
                        <td colSpan={2} className="px-3 py-2.5 text-sm font-medium text-ink-600 sm:hidden">Total</td>
                        <td colSpan={3} className="hidden px-3 py-2.5 text-sm font-medium text-ink-600 sm:table-cell">Total</td>
                        <td className="px-3 py-2.5 text-right text-base font-semibold text-ink-900 tabular">{money(order.totalAmount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-ink-900">Stock movements</h3>
                {order.movements.length === 0 ? (
                  <p className="text-sm text-ink-500">No stock movements recorded for this order.</p>
                ) : (
                  <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
                    {order.movements.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                        <div className="flex min-w-0 items-center gap-2">
                          <MovementReasonBadge reason={m.reason} />
                          <span className="truncate text-ink-600">
                            {order.items.find((i) => i.productId === m.productId)?.product.name ?? `Product ${m.productId}`}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="hidden text-xs text-ink-400 sm:inline">{dateTime(m.createdAt)}</span>
                          <QtyDelta value={m.changeQty} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            {actions && actions.length > 0 && (
              <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-ink-200 bg-surface px-5 py-3">
                {actions.includes('CANCELLED') && (
                  <Button variant="secondary" icon={<XCircle className="h-4 w-4 text-danger-500" />} onClick={() => setPending('CANCELLED')}>
                    Cancel order
                  </Button>
                )}
                {actions.includes('CONFIRMED') && (
                  <Button icon={<CircleCheck className="h-4 w-4" />} onClick={() => setPending('CONFIRMED')}>
                    Confirm order
                  </Button>
                )}
                {actions.includes('FULFILLED') && (
                  <Button icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setPending('FULFILLED')}>
                    Mark as fulfilled
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </Drawer>

      {order && (
        <ConfirmDialog
          open={!!pending}
          onClose={() => setPending(null)}
          onConfirm={() => pending && run(pending)}
          loading={busy}
          tone={pending === 'CANCELLED' ? 'danger' : 'primary'}
          title={pending === 'CANCELLED' ? `Cancel ${order.orderNumber}?` : pending === 'FULFILLED' ? 'Mark as fulfilled?' : 'Confirm order?'}
          confirmLabel={pending === 'CANCELLED' ? 'Cancel order' : pending === 'FULFILLED' ? 'Mark fulfilled' : 'Confirm'}
          message={confirmMessage(order, pending)}
        />
      )}
    </>
  );
}

/** Mirrors the server's TRANSITIONS table. */
export function availableActions(status: OrderStatus): Action[] {
  if (status === 'PENDING') return ['CONFIRMED', 'CANCELLED'];
  if (status === 'CONFIRMED') return ['FULFILLED', 'CANCELLED'];
  return [];
}

function confirmMessage(order: OrderDetail, action: Action | null) {
  const units = order.items.reduce((s, i) => s + i.quantity, 0);
  if (action === 'CANCELLED') {
    return order.type === 'SALE'
      ? `${units} units will be returned to stock and recorded as returns. This can't be undone.`
      : `${units} units will be removed from stock. If some have already been sold, the cancellation will be refused. This can't be undone.`;
  }
  if (action === 'FULFILLED') {
    return order.type === 'SALE'
      ? 'Confirm the goods have been delivered to the customer. Fulfilled orders can no longer be cancelled.'
      : 'Confirm the goods have been received from the supplier. Fulfilled orders can no longer be cancelled.';
  }
  // Confirming a PENDING draft commits its stock effect.
  return order.type === 'SALE'
    ? 'Stock for every item will be deducted now. If any item no longer has enough stock, the order stays pending.'
    : 'Stock for every item will be added now.';
}
