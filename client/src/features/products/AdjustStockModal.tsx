import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, Minus, Plus } from 'lucide-react';
import { productsApi } from '../../api/resources';
import { getErrorMessage } from '../../lib/errors';
import { Modal } from '../../components/ui/Overlay';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Field';
import { InlineAlert } from '../../components/ui/States';
import { Segmented } from '../../components/ui/Toolbar';
import { StockBadge } from '../../components/domain/Badges';
import { useToast } from '../../components/ui/Toast';
import type { Product } from '../../types';

type Direction = 'add' | 'remove';

export function AdjustStockModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: (p: Product) => void;
}) {
  const toast = useToast();
  const [direction, setDirection] = useState<Direction>('add');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState<'ADJUSTMENT' | 'RETURN'>('ADJUSTMENT');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (product) {
      setDirection('add');
      setQty('');
      setReason('ADJUSTMENT');
      setNote('');
      setError(null);
    }
  }, [product]);

  if (!product) return null;

  const n = Number(qty);
  const valid = qty !== '' && Number.isInteger(n) && n > 0;
  const next = valid ? product.quantityInStock + (direction === 'add' ? n : -n) : product.quantityInStock;
  const goesNegative = next < 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return setError('Enter a whole number greater than 0.');
    if (goesNegative) return setError(`You can remove at most ${product.quantityInStock} units.`);
    setSaving(true);
    setError(null);
    try {
      const res = await productsApi.adjust(product.id, {
        changeQty: direction === 'add' ? n : -n,
        reason: direction === 'add' ? reason : 'ADJUSTMENT',
        note: note.trim() || undefined,
      });
      toast.success('Stock updated', `${product.name}: ${product.quantityInStock} → ${res.data.data.quantityInStock} units`);
      onSaved(res.data.data);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Adjust stock"
      description={`${product.name} · ${product.sku}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="adjust-form" loading={saving} disabled={!valid || goesNegative}>
            Record adjustment
          </Button>
        </>
      }
    >
      <form id="adjust-form" onSubmit={submit} className="space-y-4">
        {error && <InlineAlert>{error}</InlineAlert>}
        <Segmented<Direction>
          label="Adjustment direction"
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'add', label: 'Add stock' },
            { value: 'remove', label: 'Remove stock' },
          ]}
        />
        <Field label="Quantity" required>
          <Input type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
        </Field>
        {direction === 'add' && (
          <Field label="Reason">
            <Select value={reason} onChange={(e) => setReason(e.target.value as 'ADJUSTMENT' | 'RETURN')}>
              <option value="ADJUSTMENT">Stock count correction</option>
              <option value="RETURN">Customer return</option>
            </Select>
          </Field>
        )}
        <Field label="Note" hint="Saved to the audit log (e.g. “damaged in transit”, “cycle count”)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Field>
        <div className="flex items-center justify-between rounded-lg border border-ink-200 bg-ink-50 px-4 py-3">
          <div className="text-sm">
            <p className="text-xs text-ink-500">Current</p>
            <p className="font-semibold text-ink-900 tabular">{product.quantityInStock}</p>
          </div>
          <span className="flex items-center gap-1 text-ink-400">
            {direction === 'add' ? <Plus className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
            <span className="tabular">{valid ? n : 0}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
          <div className="text-right text-sm">
            <p className="text-xs text-ink-500">After</p>
            <p className={goesNegative ? 'font-semibold text-danger-600 tabular' : 'font-semibold text-ink-900 tabular'}>{next}</p>
          </div>
          <div className="hidden sm:block">{!goesNegative && <StockBadge qty={next} reorder={product.reorderLevel} />}</div>
        </div>
      </form>
    </Modal>
  );
}
