import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { customersApi, ordersApi, productsApi, suppliersApi } from '../../api/resources';
import { apiError, getErrorMessage } from '../../lib/errors';
import { money, moneyPrecise } from '../../lib/format';
import { Modal } from '../../components/ui/Overlay';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Field';
import { InlineAlert, Skeleton } from '../../components/ui/States';
import { Segmented } from '../../components/ui/Toolbar';
import { useToast } from '../../components/ui/Toast';
import { CustomerFormModal } from '../customers/CustomerFormModal';
import type { Customer, Order, OrderType, Product, Supplier } from '../../types';

interface Line {
  key: number;
  productId: string;
  quantity: string;
}

let lineKey = 1;
const newLine = (productId = ''): Line => ({ key: lineKey++, productId, quantity: '1' });

export function NewOrderModal({
  open,
  onClose,
  onCreated,
  initialType = 'SALE',
  initialProductId,
  initialSupplierId,
  initialCustomerId,
  allowPurchase,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (o: Order) => void;
  initialType?: OrderType;
  initialProductId?: number;
  initialSupplierId?: number;
  initialCustomerId?: number;
  allowPurchase: boolean;
}) {
  const toast = useToast();
  const [type, setType] = useState<OrderType>(initialType);
  /** '' = walk-in sale (no customer). */
  const [customerId, setCustomerId] = useState('');
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [lineErrors, setLineErrors] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset + load reference data each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setType(allowPurchase ? initialType : 'SALE');
    setCustomerId(initialCustomerId ? String(initialCustomerId) : '');
    setSupplierId(initialSupplierId ? String(initialSupplierId) : '');
    setLines([newLine(initialProductId ? String(initialProductId) : '')]);
    setLineErrors({});
    setError(null);
    setProducts(null);
    productsApi
      .list({ limit: 100, sort: 'name', order: 'asc' })
      .then((r) => setProducts(r.data.data))
      .catch((e) => {
        setProducts([]);
        setError(getErrorMessage(e));
      });
    suppliersApi.list().then((r) => setSuppliers(r.data.data)).catch(() => undefined);
    // Active customers for the picker. A pre-selected customer outside the first
    // page (e.g. opened from a customer's "New sale") is fetched and added.
    customersApi
      .list({ status: 'active', sort: 'name', order: 'asc', limit: 100 })
      .then(async (r) => {
        let list = r.data.data;
        if (initialCustomerId && !list.some((c) => c.id === initialCustomerId)) {
          const one = await customersApi.get(initialCustomerId).then((x) => x.data.data).catch(() => null);
          if (one?.isActive) list = [one, ...list];
          else setCustomerId('');
        }
        setCustomers(list);
      })
      .catch(() => undefined);
  }, [open, initialType, initialProductId, initialSupplierId, initialCustomerId, allowPurchase]);

  const selectedCustomer = customers.find((c) => String(c.id) === customerId);

  const byId = useMemo(() => new Map((products ?? []).map((p) => [String(p.id), p])), [products]);
  const priceOf = (p: Product) => Number(type === 'SALE' ? p.unitPrice : p.costPrice);

  // Purchases: show the chosen supplier's products first.
  const productOptions = useMemo(() => {
    if (!products) return [];
    if (type !== 'PURCHASE' || !supplierId) return products;
    const sid = Number(supplierId);
    return [...products].sort((a, b) => Number(b.supplierId === sid) - Number(a.supplierId === sid));
  }, [products, type, supplierId]);

  const total = lines.reduce((sum, l) => {
    const p = byId.get(l.productId);
    return p ? sum + priceOf(p) * (Number(l.quantity) || 0) : sum;
  }, 0);

  const updateLine = (key: number, patch: Partial<Line>) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setLineErrors((e) => {
      const { [key]: _removed, ...rest } = e;
      return rest;
    });
  };

  // 'Save as draft' records a PENDING order: no stock effect until it is confirmed.
  // A ref, not state: the submit handler runs in the same click, before a re-render.
  const asDraft = useRef(false);

  const validateLines = (draft: boolean) => {
    const errs: Record<number, string> = {};
    for (const l of lines) {
      const p = byId.get(l.productId);
      const q = Number(l.quantity);
      if (!p) errs[l.key] = 'Choose a product';
      else if (!Number.isInteger(q) || q < 1) errs[l.key] = 'Quantity must be a whole number ≥ 1';
      else if (!draft && type === 'SALE' && q > p.quantityInStock) errs[l.key] = `Only ${p.quantityInStock} in stock`;
    }
    setLineErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const draft = asDraft.current;
    if (!validateLines(draft)) return;
    setSaving(true);
    try {
      const res = await ordersApi.create({
        type,
        status: draft ? 'PENDING' : 'CONFIRMED',
        // Sales: link the selected customer (blank = walk-in). Purchases never carry a customer.
        customerId: type === 'SALE' && customerId ? Number(customerId) : undefined,
        supplierId: type === 'PURCHASE' && supplierId ? Number(supplierId) : undefined,
        items: lines.map((l) => ({ productId: Number(l.productId), quantity: Number(l.quantity) })),
      });
      toast.success(
        draft ? 'Draft saved' : type === 'SALE' ? 'Sale recorded' : 'Purchase order created',
        `${res.data.data.orderNumber} · ${money(res.data.data.totalAmount)} · ${draft ? 'no stock change until confirmed' : 'stock updated'}`,
      );
      // The parent closes the modal as part of onCreated (it also navigates to the new order).
      onCreated(res.data.data);
    } catch (err) {
      const body = apiError(err);
      const details = body.details as { productId?: number; available?: number } | undefined;
      if (body.error === 'INSUFFICIENT_STOCK' && details?.productId) {
        const line = lines.find((l) => Number(l.productId) === details.productId);
        if (line) setLineErrors({ [line.key]: `Only ${details.available ?? 'a few'} in stock now — stock changed since you opened this form` });
        // Refresh stock figures so the user sees current availability.
        productsApi.list({ limit: 100, sort: 'name', order: 'asc' }).then((r) => setProducts(r.data.data)).catch(() => undefined);
      }
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const selected = new Set(lines.map((l) => l.productId).filter(Boolean));

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={type === 'SALE' ? 'New sale' : 'New purchase order'}
      description={
        type === 'SALE'
          ? 'Stock is deducted as soon as the sale is recorded.'
          : 'Stock is added as soon as the purchase order is recorded.'
      }
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-500">
            Total <span className="ml-1 text-lg font-semibold text-ink-900 tabular">{moneyPrecise(total)}</span>
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="order-form" variant="secondary" disabled={!products || saving} onClick={() => (asDraft.current = true)}>
              Save as draft
            </Button>
            <Button type="submit" form="order-form" loading={saving} disabled={!products} onClick={() => (asDraft.current = false)}>
              {type === 'SALE' ? 'Record sale' : 'Create purchase order'}
            </Button>
          </div>
        </div>
      }
    >
      <form id="order-form" onSubmit={submit} noValidate className="space-y-5">
        {error && <InlineAlert>{error}</InlineAlert>}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {allowPurchase && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink-700">Order type</span>
              <Segmented<OrderType>
                label="Order type"
                value={type}
                onChange={(t) => {
                  setType(t);
                  setLineErrors({});
                }}
                options={[
                  { value: 'SALE', label: 'Sale' },
                  { value: 'PURCHASE', label: 'Purchase' },
                ]}
              />
            </div>
          )}
          {type === 'SALE' ? (
            <Field
              label="Customer"
              className="flex-1"
              hint={
                <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="min-w-0 truncate">
                    {selectedCustomer
                      ? [selectedCustomer.companyName, selectedCustomer.phone || selectedCustomer.email].filter(Boolean).join(' · ') ||
                        `${selectedCustomer.stats.orders} previous orders`
                      : 'Walk-in sale — no customer account'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setNewCustomerOpen(true)}
                    className="inline-flex shrink-0 items-center gap-1 font-medium text-brand-700 hover:underline"
                  >
                    <Plus className="h-3 w-3" /> New customer
                  </button>
                </span>
              }
            >
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Walk-in customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.companyName ? ` — ${c.companyName}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Supplier" className="flex-1" hint="Products from this supplier are listed first">
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">No supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        <div className="rounded-xl border border-ink-200">
          <div className="hidden grid-cols-[minmax(0,1fr)_96px_110px_36px] gap-3 border-b border-ink-200 bg-ink-50 px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-ink-500 sm:grid">
            <span>Product</span>
            <span>Qty</span>
            <span className="text-right">Line total</span>
            <span />
          </div>
          {!products ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
          ) : (
            <ul className="divide-y divide-ink-100">
              {lines.map((l) => {
                const p = byId.get(l.productId);
                const lineTotal = p ? priceOf(p) * (Number(l.quantity) || 0) : 0;
                const err = lineErrors[l.key];
                return (
                  <li key={l.key} className="p-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_80px_36px] gap-2 sm:grid-cols-[minmax(0,1fr)_96px_110px_36px] sm:gap-3">
                      <Select
                        aria-label="Product"
                        value={l.productId}
                        onChange={(e) => updateLine(l.key, { productId: e.target.value })}
                        className={err && !p ? 'control-invalid' : ''}
                      >
                        <option value="">Select a product…</option>
                        {productOptions.map((opt) => (
                          <option
                            key={opt.id}
                            value={opt.id}
                            disabled={(selected.has(String(opt.id)) && String(opt.id) !== l.productId) || (type === 'SALE' && opt.quantityInStock <= 0)}
                          >
                            {opt.name} · {opt.sku} · {type === 'SALE' ? `${opt.quantityInStock} in stock` : `${opt.quantityInStock} on hand`}
                          </option>
                        ))}
                      </Select>
                      <Input
                        aria-label="Quantity"
                        type="number"
                        min="1"
                        step="1"
                        value={l.quantity}
                        onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                        invalid={!!err && !!p}
                      />
                      <span className="hidden self-center text-right text-sm font-medium text-ink-900 tabular sm:block">{money(lineTotal)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove line"
                        disabled={lines.length === 1}
                        onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-1 flex justify-between gap-2 text-xs">
                      {err ? <span className="text-danger-600">{err}</span> : <span className="text-ink-500">{p ? `${moneyPrecise(priceOf(p))} each (${type === 'SALE' ? 'selling' : 'cost'} price)` : ''}</span>}
                      <span className="font-medium text-ink-700 tabular sm:hidden">{p ? money(lineTotal) : ''}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-ink-100 p-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setLines((ls) => [...ls, newLine()])}
              disabled={!products || lines.length >= (products?.length ?? 0)}
            >
              Add product
            </Button>
          </div>
        </div>
        {products && products.length === 100 && (
          <p className="text-xs text-ink-500">Showing the first 100 products alphabetically.</p>
        )}
      </form>

      {/* Rendered outside the order <form>; its own submit stops propagation. */}
      <CustomerFormModal
        open={newCustomerOpen}
        onClose={() => setNewCustomerOpen(false)}
        onSaved={(c) => {
          setCustomers((list) => [c, ...list.filter((x) => x.id !== c.id)]);
          setCustomerId(String(c.id));
          setNewCustomerOpen(false);
        }}
      />
    </Modal>
  );
}
