import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, Mail, MapPin, Pencil, Phone, Plus, Truck } from 'lucide-react';
import { suppliersApi } from '../api/resources';
import { useAuth } from '../auth/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { canManageInventory } from '../lib/permissions';
import { getErrorMessage } from '../lib/errors';
import { date, money } from '../lib/format';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Column, DataTable } from '../components/ui/DataTable';
import { SearchInput, Toolbar } from '../components/ui/Toolbar';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../components/ui/States';
import { Drawer, Modal } from '../components/ui/Overlay';
import { Field, Input, Textarea } from '../components/ui/Field';
import { useToast } from '../components/ui/Toast';
import { OrderStatusBadge, StockBadge } from '../components/domain/Badges';
import type { Supplier } from '../types';

export default function SuppliersPage() {
  const { user } = useAuth();
  const canManage = canManageInventory(user?.role);
  const { data, loading, error, reload } = useAsync(() => suppliersApi.list().then((r) => r.data.data), []);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [params, setParams] = useSearchParams();
  const viewingId = Number(params.get('supplier')) || null;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!data || !q) return data;
    return data.filter((s) => [s.name, s.email, s.phone].some((v) => v?.toLowerCase().includes(q)));
  }, [data, search]);

  const columns: Column<Supplier>[] = [
    {
      key: 'name',
      header: 'Supplier',
      sortValue: (s) => s.name.toLowerCase(),
      cell: (s) => (
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-500">
            <Building2 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">{s.name}</p>
            {s.address && <p className="truncate text-xs text-ink-500">{s.address}</p>}
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      hideBelow: 'md',
      cell: (s) => (
        <div className="text-xs text-ink-600">
          {s.email && <p>{s.email}</p>}
          {s.phone && <p className="text-ink-500">{s.phone}</p>}
          {!s.email && !s.phone && <span className="text-ink-400">—</span>}
        </div>
      ),
    },
    { key: 'products', header: 'Products', align: 'right', sortValue: (s) => s._count?.products ?? 0, cell: (s) => <span className="tabular">{s._count?.products ?? 0}</span> },
    { key: 'orders', header: 'Purchase orders', align: 'right', hideBelow: 'sm', sortValue: (s) => s._count?.orders ?? 0, cell: (s) => <span className="tabular">{s._count?.orders ?? 0}</span> },
    { key: 'since', header: 'Added', hideBelow: 'lg', sortValue: (s) => s.createdAt, cell: (s) => <span className="text-ink-500">{date(s.createdAt)}</span> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Suppliers"
        description="Vendors you purchase stock from."
        actions={
          canManage && (
            <Button
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              New supplier
            </Button>
          )
        }
      />
      <Card>
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, email or phone" />
        </Toolbar>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(s) => s.id}
          loading={loading}
          error={error}
          onRetry={reload}
          defaultSort={{ key: 'name', order: 'asc' }}
          onRowClick={(s) => setParams({ supplier: String(s.id) }, { replace: true })}
          empty={
            <EmptyState
              icon={<Building2 className="h-5 w-5" />}
              title={search ? 'No suppliers match your search' : 'No suppliers yet'}
              description={search ? undefined : 'Add the vendors you buy from to link them to products and purchase orders.'}
            />
          }
        />
      </Card>

      <SupplierFormModal
        open={formOpen}
        supplier={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          reload();
          setFormOpen(false);
        }}
      />
      <SupplierDrawer
        id={viewingId}
        canManage={canManage}
        onClose={() => setParams({}, { replace: true })}
        onEdit={(s) => {
          setEditing(s);
          setFormOpen(true);
        }}
        version={data}
      />
    </div>
  );
}

function SupplierFormModal({ open, supplier, onClose, onSaved }: { open: boolean; supplier: Supplier | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '' });
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ name: supplier?.name ?? '', email: supplier?.email ?? '', phone: supplier?.phone ?? '', address: supplier?.address ?? '' });
    setErrors({});
    setServerError(null);
  }, [open, supplier]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (form.name.trim().length < 2) errs.name = 'Name must be at least 2 characters';
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) errs.email = 'Enter a valid email address';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    setServerError(null);
    const body = {
      name: form.name.trim(),
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      address: form.address.trim() || undefined,
    };
    try {
      if (supplier) await suppliersApi.update(supplier.id, body);
      else await suppliersApi.create(body);
      toast.success(supplier ? 'Supplier updated' : 'Supplier added', body.name);
      onSaved();
    } catch (err) {
      setServerError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={supplier ? `Edit ${supplier.name}` : 'New supplier'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="supplier-form" loading={saving}>
            {supplier ? 'Save changes' : 'Add supplier'}
          </Button>
        </>
      }
    >
      <form id="supplier-form" onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {serverError && (
          <div className="sm:col-span-2">
            <InlineAlert>{serverError}</InlineAlert>
          </div>
        )}
        <Field label="Company name" required error={errors.name} className="sm:col-span-2">
          <Input value={form.name} onChange={set('name')} invalid={!!errors.name} />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input type="email" value={form.email} onChange={set('email')} invalid={!!errors.email} />
        </Field>
        <Field label="Phone">
          <Input type="tel" value={form.phone} onChange={set('phone')} maxLength={30} />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Textarea value={form.address} onChange={set('address')} maxLength={200} />
        </Field>
      </form>
    </Modal>
  );
}

function SupplierDrawer({
  id,
  canManage,
  onClose,
  onEdit,
  version,
}: {
  id: number | null;
  canManage: boolean;
  onClose: () => void;
  onEdit: (s: Supplier) => void;
  version: unknown;
}) {
  const navigate = useNavigate();
  const { data, error, reload } = useAsync(() => (id ? suppliersApi.get(id).then((r) => r.data.data) : Promise.resolve(undefined)), [id, version]);
  if (!id) return null;
  const s = data && data.id === id ? data : undefined;

  return (
    <Drawer
      open
      onClose={onClose}
      title={s?.name ?? 'Supplier'}
      subtitle={s && `Supplier since ${date(s.createdAt)}`}
      actions={
        s &&
        canManage && (
          <>
            <Button size="sm" variant="secondary" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => onEdit(s)}>
              Edit
            </Button>
            <Button size="sm" icon={<Truck className="h-3.5 w-3.5" />} onClick={() => navigate(`/orders?type=PURCHASE&new=1&supplier=${s.id}`)}>
              New PO
            </Button>
          </>
        )
      }
    >
      {error && !s ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !s ? (
        <div className="space-y-3 p-5">
          <Skeleton className="h-16" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="space-y-6 p-5">
          <ul className="space-y-2 rounded-xl border border-ink-200 p-4 text-sm">
            <li className="flex items-center gap-2 text-ink-700">
              <Mail className="h-4 w-4 text-ink-400" /> {s.email || <span className="text-ink-400">No email</span>}
            </li>
            <li className="flex items-center gap-2 text-ink-700">
              <Phone className="h-4 w-4 text-ink-400" /> {s.phone || <span className="text-ink-400">No phone</span>}
            </li>
            <li className="flex items-center gap-2 text-ink-700">
              <MapPin className="h-4 w-4 text-ink-400" /> {s.address || <span className="text-ink-400">No address</span>}
            </li>
          </ul>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink-900">Products supplied ({s.products.length})</h3>
            {s.products.length === 0 ? (
              <p className="text-sm text-ink-500">No active products are linked to this supplier.</p>
            ) : (
              <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
                {s.products.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink-900">{p.name}</p>
                      <p className="font-mono text-xs text-ink-500">
                        {p.sku} · cost {money(p.costPrice)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-ink-500 tabular">{p.quantityInStock} on hand</span>
                      <StockBadge qty={p.quantityInStock} reorder={p.reorderLevel} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink-900">Recent purchase orders</h3>
            {s.orders.length === 0 ? (
              <p className="text-sm text-ink-500">No purchase orders yet.</p>
            ) : (
              <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
                {s.orders.map((o) => (
                  <li key={o.id}>
                    <button onClick={() => navigate(`/orders?order=${o.id}`)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-ink-50">
                      <span>
                        <span className="font-mono text-xs font-medium text-ink-900">{o.orderNumber}</span>
                        <span className="ml-2 text-xs text-ink-500">{date(o.createdAt)}</span>
                      </span>
                      <span className="flex items-center gap-3">
                        <OrderStatusBadge status={o.status} />
                        <span className="font-medium tabular">{money(o.totalAmount)}</span>
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
