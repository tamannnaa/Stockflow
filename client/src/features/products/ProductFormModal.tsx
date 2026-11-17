import { FormEvent, useEffect, useState } from 'react';
import { productsApi } from '../../api/resources';
import { apiError, getErrorMessage } from '../../lib/errors';
import { money } from '../../lib/format';
import { Modal } from '../../components/ui/Overlay';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { InlineAlert } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import type { Category, Product, Supplier } from '../../types';

interface FormState {
  sku: string;
  name: string;
  description: string;
  categoryId: string;
  supplierId: string;
  unitPrice: string;
  costPrice: string;
  quantityInStock: string;
  reorderLevel: string;
}

const empty: FormState = {
  sku: '',
  name: '',
  description: '',
  categoryId: '',
  supplierId: '',
  unitPrice: '',
  costPrice: '',
  quantityInStock: '0',
  reorderLevel: '10',
};

function fromProduct(p: Product): FormState {
  return {
    sku: p.sku,
    name: p.name,
    description: p.description ?? '',
    categoryId: p.category?.id ? String(p.category.id) : '',
    supplierId: p.supplier?.id ? String(p.supplier.id) : '',
    unitPrice: String(Number(p.unitPrice)),
    costPrice: String(Number(p.costPrice)),
    quantityInStock: String(p.quantityInStock),
    reorderLevel: String(p.reorderLevel),
  };
}

type Errors = Partial<Record<keyof FormState, string>>;

function validate(f: FormState, isEdit: boolean): Errors {
  const e: Errors = {};
  if (!f.sku.trim()) e.sku = 'SKU is required';
  else if (f.sku.length > 40) e.sku = 'Max 40 characters';
  if (f.name.trim().length < 2) e.name = 'Name must be at least 2 characters';
  const nonNeg = (v: string) => v !== '' && !Number.isNaN(Number(v)) && Number(v) >= 0;
  if (!nonNeg(f.unitPrice)) e.unitPrice = 'Enter a price of 0 or more';
  if (!nonNeg(f.costPrice)) e.costPrice = 'Enter a cost of 0 or more';
  if (!isEdit && (!nonNeg(f.quantityInStock) || !Number.isInteger(Number(f.quantityInStock)))) e.quantityInStock = 'Whole number, 0 or more';
  if (!nonNeg(f.reorderLevel) || !Number.isInteger(Number(f.reorderLevel))) e.reorderLevel = 'Whole number, 0 or more';
  return e;
}

export function ProductFormModal({
  open,
  onClose,
  product,
  categories,
  suppliers,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  product?: Product | null;
  categories: Category[];
  suppliers: Supplier[];
  onSaved: (p: Product) => void;
}) {
  const isEdit = !!product;
  const toast = useToast();
  const [form, setForm] = useState<FormState>(empty);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(product ? fromProduct(product) : empty);
      setErrors({});
      setServerError(null);
    }
  }, [open, product]);

  const set = (key: keyof FormState) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }));
  };

  const margin =
    form.unitPrice !== '' && form.costPrice !== '' && Number(form.unitPrice) > 0
      ? ((Number(form.unitPrice) - Number(form.costPrice)) / Number(form.unitPrice)) * 100
      : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = validate(form, isEdit);
    setErrors(v);
    if (Object.keys(v).length) return;
    setSaving(true);
    setServerError(null);
    const body: Record<string, unknown> = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      categoryId: form.categoryId ? Number(form.categoryId) : isEdit ? null : undefined,
      supplierId: form.supplierId ? Number(form.supplierId) : isEdit ? null : undefined,
      unitPrice: Number(form.unitPrice),
      costPrice: Number(form.costPrice),
      reorderLevel: Number(form.reorderLevel),
    };
    if (!isEdit) body.quantityInStock = Number(form.quantityInStock);
    try {
      const res = isEdit ? await productsApi.update(product!.id, body) : await productsApi.create(body);
      toast.success(isEdit ? 'Product updated' : 'Product created', `${res.data.data.name} (${res.data.data.sku})`);
      onSaved(res.data.data);
      onClose();
    } catch (err) {
      const { error } = apiError(err);
      if (error === 'SKU_TAKEN' || error === 'CONFLICT') setErrors({ sku: 'This SKU is already used by another product' });
      else setServerError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? `Edit ${product!.name}` : 'New product'}
      description={isEdit ? 'Stock quantity is changed with “Adjust stock” so every change is recorded.' : 'Add an item to your catalogue. Opening stock is recorded in the stock history.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="product-form" loading={saving}>
            {isEdit ? 'Save changes' : 'Create product'}
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={submit} noValidate className="space-y-5">
        {serverError && <InlineAlert>{serverError}</InlineAlert>}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="SKU" required error={errors.sku} className="sm:col-span-1">
            <Input value={form.sku} onChange={set('sku')} placeholder="ELEC-003" invalid={!!errors.sku} className="font-mono" />
          </Field>
          <Field label="Product name" required error={errors.name} className="sm:col-span-2">
            <Input value={form.name} onChange={set('name')} placeholder="Bluetooth Keyboard" invalid={!!errors.name} />
          </Field>
          <Field label="Description" className="sm:col-span-3">
            <Textarea value={form.description} onChange={set('description')} maxLength={500} placeholder="Optional details shown to your team" />
          </Field>
          <Field label="Category">
            <Select value={form.categoryId} onChange={set('categoryId')}>
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Preferred supplier" className="sm:col-span-2">
            <Select value={form.supplierId} onChange={set('supplierId')}>
              <option value="">None</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </section>

        <section className="grid grid-cols-1 gap-4 border-t border-ink-100 pt-5 sm:grid-cols-3">
          <Field label="Selling price (₹)" required error={errors.unitPrice}>
            <Input type="number" min="0" step="0.01" inputMode="decimal" value={form.unitPrice} onChange={set('unitPrice')} invalid={!!errors.unitPrice} />
          </Field>
          <Field
            label="Cost price (₹)"
            required
            error={errors.costPrice}
            hint={margin !== null ? `Margin ${margin.toFixed(1)}%${margin < 0 ? ' — selling below cost' : ''}` : undefined}
          >
            <Input type="number" min="0" step="0.01" inputMode="decimal" value={form.costPrice} onChange={set('costPrice')} invalid={!!errors.costPrice} />
          </Field>
          <Field label="Reorder level" required error={errors.reorderLevel} hint="Alert when stock reaches this">
            <Input type="number" min="0" step="1" value={form.reorderLevel} onChange={set('reorderLevel')} invalid={!!errors.reorderLevel} />
          </Field>
          {!isEdit && (
            <Field
              label="Opening stock"
              error={errors.quantityInStock}
              hint={form.quantityInStock && form.costPrice ? `Value ${money(Number(form.quantityInStock) * Number(form.costPrice))} at cost` : undefined}
            >
              <Input type="number" min="0" step="1" value={form.quantityInStock} onChange={set('quantityInStock')} invalid={!!errors.quantityInStock} />
            </Field>
          )}
        </section>
      </form>
    </Modal>
  );
}
