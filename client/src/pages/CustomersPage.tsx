import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Archive, ArchiveRestore, Eye, Pencil, Plus, ShoppingCart, Trash2, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { customersApi } from '../api/resources';
import { useAuth } from '../auth/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { useDebounce } from '../hooks/useDebounce';
import { useUrlState } from '../hooks/useUrlState';
import { canManageInventory } from '../lib/permissions';
import { getErrorMessage } from '../lib/errors';
import { count, date, money, relativeTime } from '../lib/format';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Column, DataTable } from '../components/ui/DataTable';
import { Pagination } from '../components/ui/Pagination';
import { SearchInput, Segmented, Toolbar } from '../components/ui/Toolbar';
import { EmptyState } from '../components/ui/States';
import { RowMenu, MenuItem } from '../components/ui/Menu';
import { ConfirmDialog } from '../components/ui/Overlay';
import { useToast } from '../components/ui/Toast';
import { CustomerFormModal } from '../features/customers/CustomerFormModal';
import { CustomerDrawer } from '../features/customers/CustomerDrawer';
import type { Customer } from '../types';

type Status = 'active' | 'archived' | 'all';
type Pending = { customer: Customer; action: 'archive' | 'restore' | 'delete' };

export default function CustomersPage() {
  const { user } = useAuth();
  const canManage = canManageInventory(user?.role);
  const toast = useToast();
  const navigate = useNavigate();

  const [f, setF] = useUrlState({ q: '', status: 'active', sort: 'name', order: 'asc', page: '1' });
  const [searchText, setSearchText] = useState(f.q);
  const debounced = useDebounce(searchText, 300);
  useEffect(() => {
    if (debounced !== f.q) setF({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const page = Number(f.page) || 1;
  const { data, loading, error, reload } = useAsync(
    () => customersApi.list({ search: f.q, status: f.status, sort: f.sort, order: f.order, page, limit: 20 }).then((r) => r.data),
    [f.q, f.status, f.sort, f.order, page],
  );

  // ?customer=ID opens the detail drawer (deep-linkable from orders).
  const [params, setParams] = useSearchParams();
  const viewingId = Number(params.get('customer')) || null;
  const setViewing = (id: number | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('customer', String(id));
        else next.delete('customer');
        return next;
      },
      { replace: true },
    );

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [drawerVersion, setDrawerVersion] = useState(0);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (c: Customer) => {
    setEditing(c);
    setFormOpen(true);
  };

  const runPending = async () => {
    if (!pending) return;
    const { customer: c, action } = pending;
    setBusy(true);
    try {
      if (action === 'archive') await customersApi.archive(c.id);
      if (action === 'restore') await customersApi.restore(c.id);
      if (action === 'delete') {
        await customersApi.remove(c.id);
        if (viewingId === c.id) setViewing(null);
      }
      toast.success(
        action === 'archive' ? 'Customer archived' : action === 'restore' ? 'Customer restored' : 'Customer deleted',
        c.name,
      );
      setPending(null);
      setDrawerVersion((v) => v + 1);
      reload();
    } catch (err) {
      toast.error('Action failed', getErrorMessage(err));
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  const menuFor = (c: Customer): MenuItem[] => {
    const items: MenuItem[] = [
      { label: 'View details', icon: <Eye />, onSelect: () => setViewing(c.id) },
      { label: 'Edit', icon: <Pencil />, onSelect: () => openEdit(c) },
    ];
    if (c.isActive) items.push({ label: 'New sale', icon: <ShoppingCart />, onSelect: () => navigate(`/orders?type=SALE&new=1&customer=${c.id}`) });
    if (canManage) {
      if (c.isActive) items.push({ label: 'Archive', icon: <Archive />, onSelect: () => setPending({ customer: c, action: 'archive' }) });
      else items.push({ label: 'Restore', icon: <ArchiveRestore />, onSelect: () => setPending({ customer: c, action: 'restore' }) });
      if (c.orderCount === 0) items.push({ label: 'Delete', icon: <Trash2 />, danger: true, onSelect: () => setPending({ customer: c, action: 'delete' }) });
    }
    return items;
  };

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: 'Customer',
      sortable: true,
      cell: (c) => (
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate font-medium text-ink-900">
            {c.name}
            {!c.isActive && <Badge tone="neutral">Archived</Badge>}
          </p>
          {c.companyName && <p className="truncate text-xs text-ink-500">{c.companyName}</p>}
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      hideBelow: 'lg',
      cell: (c) =>
        c.email || c.phone ? (
          <div className="text-xs text-ink-600">
            {c.email && <p className="truncate">{c.email}</p>}
            {c.phone && <p className="text-ink-500">{c.phone}</p>}
          </div>
        ) : (
          <span className="text-ink-400">—</span>
        ),
    },
    { key: 'orders', header: 'Orders', sortable: true, align: 'right', cell: (c) => <span className="tabular">{count(c.stats.orders)}</span> },
    {
      key: 'totalSpent',
      header: 'Total spent',
      sortable: true,
      align: 'right',
      cell: (c) => <span className="font-medium text-ink-900 tabular">{money(c.stats.totalSpent)}</span>,
    },
    {
      key: 'avg',
      header: 'Avg. order',
      align: 'right',
      hideBelow: 'md',
      cell: (c) => <span className="tabular">{c.stats.orders ? money(c.stats.avgOrderValue) : '—'}</span>,
    },
    {
      key: 'lastOrderAt',
      header: 'Last order',
      sortable: true,
      hideBelow: 'sm',
      cell: (c) =>
        c.stats.lastOrderAt ? (
          <span className="text-ink-600" title={date(c.stats.lastOrderAt)}>
            {relativeTime(c.stats.lastOrderAt)}
          </span>
        ) : (
          <span className="text-ink-400">No orders</span>
        ),
    },
    {
      key: 'createdAt',
      header: 'Customer since',
      sortable: true,
      hideBelow: 'lg',
      cell: (c) => <span className="text-ink-500">{date(c.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      width: '56px',
      cell: (c) => <RowMenu items={menuFor(c)} />,
    },
  ];

  const filtersActive = !!f.q || f.status !== 'active';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Customers"
        description={
          data
            ? `${count(data.pagination.total)} ${f.status === 'archived' ? 'archived' : f.status === 'all' ? '' : 'active'} customers. Spending counts confirmed and fulfilled orders only.`
            : 'People and businesses you sell to'
        }
        actions={
          <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={openCreate}>
            Add customer
          </Button>
        }
      />

      <Card>
        <Toolbar>
          <SearchInput value={searchText} onChange={setSearchText} placeholder="Name, company, email, phone or GSTIN" className="sm:w-80" />
          <Segmented<Status>
            label="Customer status"
            value={f.status as Status}
            onChange={(v) => setF({ status: v })}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'archived', label: 'Archived' },
              { value: 'all', label: 'All' },
            ]}
          />
          {data && data.walkIn.orders > 0 && (
            <p className="text-xs text-ink-500 sm:ml-auto">
              Walk-in sales (no customer): <span className="font-medium text-ink-700">{count(data.walkIn.orders)}</span> orders ·{' '}
              <span className="font-medium text-ink-700 tabular">{money(data.walkIn.total)}</span>
            </p>
          )}
        </Toolbar>
        <DataTable
          columns={columns}
          rows={data?.data}
          rowKey={(c) => c.id}
          loading={loading}
          error={error}
          onRetry={reload}
          onRowClick={(c) => setViewing(c.id)}
          sort={{ key: f.sort, order: f.order as 'asc' | 'desc' }}
          onSortChange={(s) => setF({ sort: s.key, order: s.order })}
          empty={
            filtersActive ? (
              <EmptyState
                icon={<Users className="h-5 w-5" />}
                title={f.status === 'archived' && !f.q ? 'No archived customers' : 'No customers match your search'}
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSearchText('');
                      setF({ q: '', status: 'active' });
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={<Users className="h-5 w-5" />}
                title="No customers yet"
                description="Add a customer, or pick one when recording a sale, to track their orders and spending."
                action={
                  <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={openCreate}>
                    Add customer
                  </Button>
                }
              />
            )
          }
        />
        <Pagination pagination={data?.pagination} onPage={(p) => setF({ page: String(p) }, { resetPage: false })} />
      </Card>

      <CustomerFormModal
        open={formOpen}
        customer={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(c) => {
          setFormOpen(false);
          reload();
          setDrawerVersion((v) => v + 1);
          if (!editing) setViewing(c.id);
        }}
      />
      <CustomerDrawer id={viewingId} version={drawerVersion} onClose={() => setViewing(null)} onEdit={openEdit} />
      <ConfirmDialog
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirm={runPending}
        loading={busy}
        tone={pending?.action === 'restore' ? 'primary' : 'danger'}
        title={
          pending?.action === 'archive'
            ? `Archive ${pending.customer.name}?`
            : pending?.action === 'restore'
              ? `Restore ${pending.customer.name}?`
              : `Delete ${pending?.customer.name}?`
        }
        confirmLabel={pending?.action === 'archive' ? 'Archive' : pending?.action === 'restore' ? 'Restore' : 'Delete customer'}
        message={
          pending?.action === 'archive'
            ? 'They will be hidden from the customer list and can’t be selected for new sales. Their order history and statistics are kept, and you can restore them at any time.'
            : pending?.action === 'restore'
              ? 'They will appear in the customer list again and can be selected for new sales.'
              : 'This customer has no orders, so they will be permanently deleted. This can’t be undone.'
        }
      />
    </div>
  );
}
