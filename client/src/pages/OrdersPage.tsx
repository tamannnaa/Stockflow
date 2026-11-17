import { useEffect, useState } from 'react';
import { CheckCircle2, Eye, Plus, ShoppingCart, Truck, XCircle } from 'lucide-react';
import { ordersApi } from '../api/resources';
import { useAuth } from '../auth/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { useDebounce } from '../hooks/useDebounce';
import { useUrlState } from '../hooks/useUrlState';
import { canChangeOrderStatus, canManageInventory } from '../lib/permissions';
import { getErrorMessage } from '../lib/errors';
import { count, date, money, relativeTime } from '../lib/format';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Column, DataTable } from '../components/ui/DataTable';
import { Pagination } from '../components/ui/Pagination';
import { FilterSelect, SearchInput, Segmented, Toolbar } from '../components/ui/Toolbar';
import { EmptyState } from '../components/ui/States';
import { RowMenu } from '../components/ui/Menu';
import { ConfirmDialog } from '../components/ui/Overlay';
import { useToast } from '../components/ui/Toast';
import { OrderStatusBadge, OrderTypeBadge } from '../components/domain/Badges';
import { NewOrderModal } from '../features/orders/NewOrderModal';
import { OrderDrawer, availableActions } from '../features/orders/OrderDrawer';
import type { Order, OrderType } from '../types';

const PAGE_SIZE = 20;

export default function OrdersPage() {
  const { user } = useAuth();
  const toast = useToast();
  const canStatus = canChangeOrderStatus(user?.role);
  const canPurchase = canManageInventory(user?.role);

  const [f, setF, params, setParams] = useUrlState({ type: '', status: '', q: '', customerId: '', page: '1' });
  const [searchText, setSearchText] = useState(f.q);
  const debounced = useDebounce(searchText, 300);
  useEffect(() => {
    if (debounced !== f.q) setF({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const page = Number(f.page) || 1;
  const { data, loading, error, reload } = useAsync(
    () => ordersApi.list({ type: f.type, status: f.status, search: f.q, customerId: f.customerId, page, limit: PAGE_SIZE }).then((r) => r.data),
    [f.type, f.status, f.q, f.customerId, page],
  );

  // Deep-link params: ?new=1 opens the create form, ?order=ID opens the detail drawer.
  const newOpen = params.get('new') === '1';
  const orderParam = Number(params.get('order')) || null;
  // One combined update: separate setParams calls in the same tick would overwrite each other.
  const patchParams = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );
  const setParam = (key: string, value: string | null) => patchParams({ [key]: value });
  const closeNewParams = { new: null, newType: null, product: null, supplier: null, customer: null };

  const [quick, setQuick] = useState<{ order: Order; action: 'FULFILLED' | 'CANCELLED' } | null>(null);
  const [quickBusy, setQuickBusy] = useState(false);

  const runQuick = async () => {
    if (!quick) return;
    setQuickBusy(true);
    try {
      await ordersApi.updateStatus(quick.order.id, quick.action);
      toast.success(quick.action === 'CANCELLED' ? 'Order cancelled' : 'Order fulfilled', quick.order.orderNumber);
      setQuick(null);
      reload();
    } catch (err) {
      toast.error('Status not changed', getErrorMessage(err));
      setQuick(null);
    } finally {
      setQuickBusy(false);
    }
  };

  const isSale = f.type === 'SALE';
  const isPurchase = f.type === 'PURCHASE';
  const title = isSale ? 'Sales orders' : isPurchase ? 'Purchase orders' : 'Orders';

  const columns: Column<Order>[] = [
    {
      key: 'order',
      header: 'Order',
      cell: (o) => (
        <div>
          <p className="font-mono text-xs font-medium text-ink-900">{o.orderNumber}</p>
          <p className="mt-0.5 text-xs text-ink-500" title={date(o.createdAt)}>
            {relativeTime(o.createdAt)}
          </p>
        </div>
      ),
    },
    ...(!f.type ? [{ key: 'type', header: 'Type', hideBelow: 'sm' as const, cell: (o: Order) => <OrderTypeBadge type={o.type} /> }] : []),
    {
      key: 'party',
      header: isPurchase ? 'Supplier' : isSale ? 'Customer' : 'Customer / supplier',
      cell: (o) => (
        <span className="line-clamp-1 text-ink-700">
          {o.type === 'SALE' ? o.customerName || <span className="text-ink-400">Walk-in</span> : o.supplier?.name || <span className="text-ink-400">—</span>}
        </span>
      ),
    },
    { key: 'items', header: 'Items', align: 'right', hideBelow: 'md', cell: (o) => <span className="tabular">{o._count?.items ?? '—'}</span> },
    { key: 'total', header: 'Total', align: 'right', cell: (o) => <span className="font-medium text-ink-900 tabular">{money(o.totalAmount)}</span> },
    { key: 'status', header: 'Status', hideBelow: 'sm', cell: (o) => <OrderStatusBadge status={o.status} /> },
    { key: 'by', header: 'Created by', hideBelow: 'lg', cell: (o) => <span className="text-ink-600">{o.createdBy?.name ?? '—'}</span> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      width: '56px',
      cell: (o) => {
        const acts = canStatus ? availableActions(o.status) : [];
        return (
          <RowMenu
            items={[
              { label: 'View order', icon: <Eye />, onSelect: () => setParam('order', String(o.id)) },
              ...(acts.includes('FULFILLED') ? [{ label: 'Mark fulfilled', icon: <CheckCircle2 />, onSelect: () => setQuick({ order: o, action: 'FULFILLED' }) }] : []),
              ...(acts.includes('CANCELLED') ? [{ label: 'Cancel order', icon: <XCircle />, danger: true, onSelect: () => setQuick({ order: o, action: 'CANCELLED' }) }] : []),
            ]}
          />
        );
      },
    },
  ];

  const filtersActive = !!(f.status || f.q);
  const openNew = (type: OrderType) => patchParams({ new: '1', newType: type });
  const initialType: OrderType = (params.get('newType') as OrderType) || (isPurchase ? 'PURCHASE' : 'SALE');

  return (
    <div className="space-y-5">
      <PageHeader
        title={title}
        description={
          data
            ? `${count(data.pagination.total)} ${filtersActive ? 'matching ' : ''}${data.pagination.total === 1 ? 'order' : 'orders'}`
            : isPurchase
              ? 'Stock received from suppliers'
              : 'Orders and their stock impact'
        }
        actions={
          <>
            {canPurchase && !isSale && (
              <Button variant={isPurchase ? 'primary' : 'secondary'} size="sm" icon={<Truck className="h-3.5 w-3.5" />} onClick={() => openNew('PURCHASE')}>
                New purchase order
              </Button>
            )}
            {!isPurchase && (
              <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => openNew('SALE')}>
                New sale
              </Button>
            )}
          </>
        }
      />

      <Card>
        <Toolbar>
          <Segmented<'' | OrderType>
            label="Order type"
            value={f.type as '' | OrderType}
            onChange={(v) => setF({ type: v })}
            options={[
              { value: '', label: 'All' },
              { value: 'SALE', label: 'Sales' },
              { value: 'PURCHASE', label: 'Purchases' },
            ]}
          />
          <SearchInput value={searchText} onChange={setSearchText} placeholder="Order #, customer or supplier" />
          {f.customerId && (
            <button
              type="button"
              onClick={() => setF({ customerId: '' })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-xs font-medium text-brand-800 hover:bg-brand-100"
              aria-label="Clear customer filter"
            >
              Customer: {data?.data[0]?.customer?.name ?? `#${f.customerId}`}
              <span aria-hidden>×</span>
            </button>
          )}
          <div className="flex flex-1 sm:justify-end">
            <FilterSelect
              label="Status"
              value={f.status}
              onChange={(v) => setF({ status: v })}
              options={[
                { value: 'CONFIRMED', label: 'Confirmed' },
                { value: 'FULFILLED', label: 'Fulfilled' },
                { value: 'PENDING', label: 'Pending' },
                { value: 'CANCELLED', label: 'Cancelled' },
              ]}
            />
          </div>
        </Toolbar>
        <DataTable
          columns={columns}
          rows={data?.data}
          rowKey={(o) => o.id}
          loading={loading}
          error={error}
          onRetry={reload}
          onRowClick={(o) => setParam('order', String(o.id))}
          empty={
            filtersActive ? (
              <EmptyState
                icon={<ShoppingCart className="h-5 w-5" />}
                title="No orders match these filters"
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSearchText('');
                      setF({ q: '', status: '' });
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={isPurchase ? <Truck className="h-5 w-5" /> : <ShoppingCart className="h-5 w-5" />}
                title={isPurchase ? 'No purchase orders yet' : 'No orders yet'}
                description={isPurchase ? 'Record stock received from a supplier.' : 'Record a sale to deduct stock and track revenue.'}
              />
            )
          }
        />
        <Pagination pagination={data?.pagination} onPage={(p) => setF({ page: String(p) }, { resetPage: false })} />
      </Card>

      <NewOrderModal
        // Remount per opening so the first frame already uses the requested order type/customer.
        key={newOpen ? `${initialType}-${params.get('customer') ?? ''}-${params.get('product') ?? ''}` : 'closed'}
        open={newOpen}
        onClose={() => patchParams(closeNewParams)}
        onCreated={(o) => {
          reload();
          // Close the form and open the new order's detail in a single URL update.
          patchParams({ ...closeNewParams, order: String(o.id) });
        }}
        allowPurchase={canPurchase}
        initialType={initialType}
        initialProductId={Number(params.get('product')) || undefined}
        initialSupplierId={Number(params.get('supplier')) || undefined}
        initialCustomerId={Number(params.get('customer')) || undefined}
      />

      <OrderDrawer orderId={orderParam} canChangeStatus={canStatus} onClose={() => setParam('order', null)} onChanged={reload} />

      <ConfirmDialog
        open={!!quick}
        onClose={() => setQuick(null)}
        onConfirm={runQuick}
        loading={quickBusy}
        tone={quick?.action === 'CANCELLED' ? 'danger' : 'primary'}
        title={quick?.action === 'CANCELLED' ? `Cancel ${quick.order.orderNumber}?` : `Mark ${quick?.order.orderNumber} fulfilled?`}
        confirmLabel={quick?.action === 'CANCELLED' ? 'Cancel order' : 'Mark fulfilled'}
        message={
          quick?.action === 'CANCELLED'
            ? quick.order.type === 'SALE'
              ? 'All items will be returned to stock. This can’t be undone.'
              : 'All received items will be removed from stock. If some were already sold, the cancellation is refused.'
            : 'Fulfilled orders can no longer be cancelled.'
        }
      />
    </div>
  );
}
