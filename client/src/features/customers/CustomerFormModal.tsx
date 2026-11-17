import { FormEvent, useEffect, useState } from 'react';
import { customersApi } from '../../api/resources';
import { apiError, getErrorMessage } from '../../lib/errors';
import { Modal } from '../../components/ui/Overlay';
import { Button } from '../../components/ui/Button';
import { Field, Input, Textarea } from '../../components/ui/Field';
import { InlineAlert } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import type { Customer, CustomerInput } from '../../types';

type FormState = Required<CustomerInput>;
type Errors = Partial<Record<keyof FormState, string>>;

const EMPTY: FormState = { name: '', companyName: '', email: '', phone: '', address: '', gstin: '' };
// Same rules as the API (server/src/modules/customers/customers.schema.ts).
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PHONE_RE = /^[+\d][\d\s()-]{5,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(f: FormState): Errors {
  const e: Errors = {};
  if (f.name.trim().length < 2) e.name = 'Name must be at least 2 characters';
  if (f.email.trim() && !EMAIL_RE.test(f.email.trim())) e.email = 'Enter a valid email address';
  if (f.phone.trim() && !PHONE_RE.test(f.phone.trim())) e.phone = 'Enter a valid phone number';
  if (f.gstin.trim() && !GSTIN_RE.test(f.gstin.trim().toUpperCase())) e.gstin = 'GSTIN must be 15 characters, e.g. 27AAPFU0939F1ZV';
  return e;
}

/** Create or edit a customer. Pass `customer` to edit; `initialName` pre-fills a new one. */
export function CustomerFormModal({
  open,
  onClose,
  customer,
  initialName,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  customer?: Customer | null;
  initialName?: string;
  onSaved: (c: Customer) => void;
}) {
  const isEdit = !!customer;
  const toast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      customer
        ? {
            name: customer.name,
            companyName: customer.companyName ?? '',
            email: customer.email ?? '',
            phone: customer.phone ?? '',
            address: customer.address ?? '',
            gstin: customer.gstin ?? '',
          }
        : { ...EMPTY, name: initialName ?? '' },
    );
    setErrors({});
    setServerError(null);
  }, [open, customer, initialName]);

  const set = (key: keyof FormState) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // this form can be opened from inside the order form
    const v = validate(form);
    setErrors(v);
    if (Object.keys(v).length) return;
    setSaving(true);
    setServerError(null);
    const body: CustomerInput = {
      name: form.name.trim(),
      companyName: form.companyName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      gstin: form.gstin.trim().toUpperCase(),
    };
    try {
      const res = isEdit ? await customersApi.update(customer!.id, body) : await customersApi.create(body);
      toast.success(isEdit ? 'Customer updated' : 'Customer added', res.data.data.name);
      onSaved(res.data.data);
    } catch (err) {
      const { error, details } = apiError(err);
      if (error === 'EMAIL_TAKEN') setErrors({ email: getErrorMessage(err) });
      else if (error === 'GSTIN_TAKEN') setErrors({ gstin: getErrorMessage(err) });
      else if (error === 'CUSTOMER_EXISTS') setErrors({ name: getErrorMessage(err) });
      else if (Array.isArray(details)) {
        const fieldErrors: Errors = {};
        for (const d of details as { path: string; message: string }[]) fieldErrors[d.path as keyof FormState] = d.message;
        setErrors(fieldErrors);
      } else setServerError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${customer!.name}` : 'New customer'}
      description={isEdit ? 'Changes apply to future orders. Past orders keep the name used at the time of sale.' : 'Add a customer to link their sales and track spending.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="customer-form" loading={saving}>
            {isEdit ? 'Save changes' : 'Add customer'}
          </Button>
        </>
      }
    >
      <form id="customer-form" onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {serverError && (
          <div className="sm:col-span-2">
            <InlineAlert>{serverError}</InlineAlert>
          </div>
        )}
        <Field label="Customer name" required error={errors.name}>
          <Input value={form.name} onChange={set('name')} maxLength={120} invalid={!!errors.name} autoComplete="off" />
        </Field>
        <Field label="Company name" error={errors.companyName}>
          <Input value={form.companyName} onChange={set('companyName')} maxLength={120} autoComplete="off" />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input type="email" value={form.email} onChange={set('email')} maxLength={160} invalid={!!errors.email} autoComplete="off" />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <Input type="tel" value={form.phone} onChange={set('phone')} maxLength={30} invalid={!!errors.phone} placeholder="+91 98200 11223" />
        </Field>
        <Field label="GSTIN" error={errors.gstin} hint="15-character GST number, optional" className="sm:col-span-2">
          <Input
            value={form.gstin}
            onChange={(e) => set('gstin')({ target: { value: e.target.value.toUpperCase() } })}
            maxLength={15}
            invalid={!!errors.gstin}
            className="font-mono uppercase"
            placeholder="27AAPFU0939F1ZV"
          />
        </Field>
        <Field label="Address" error={errors.address} className="sm:col-span-2">
          <Textarea value={form.address} onChange={set('address')} maxLength={300} />
        </Field>
      </form>
    </Modal>
  );
}
