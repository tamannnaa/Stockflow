import { Badge, Tone } from '../ui/Badge';
import { cn } from '../../lib/cn';
import type { MovementReason, OrderStatus, OrderType, Role } from '../../types';

const statusTone: Record<OrderStatus, Tone> = {
  PENDING: 'warning',
  CONFIRMED: 'info',
  FULFILLED: 'success',
  CANCELLED: 'neutral',
};
const statusLabel: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  FULFILLED: 'Fulfilled',
  CANCELLED: 'Cancelled',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge tone={statusTone[status]} dot>
      {statusLabel[status]}
    </Badge>
  );
}

export function OrderTypeBadge({ type }: { type: OrderType }) {
  return <Badge tone={type === 'SALE' ? 'brand' : 'accent'}>{type === 'SALE' ? 'Sale' : 'Purchase'}</Badge>;
}

export type StockState = 'out' | 'low' | 'in';
export const stockState = (qty: number, reorder: number): StockState => (qty <= 0 ? 'out' : qty <= reorder ? 'low' : 'in');

export function StockBadge({ qty, reorder }: { qty: number; reorder: number }) {
  const s = stockState(qty, reorder);
  if (s === 'out') return <Badge tone="danger" dot>Out of stock</Badge>;
  if (s === 'low') return <Badge tone="warning" dot>Low stock</Badge>;
  return <Badge tone="success" dot>In stock</Badge>;
}

/** Quantity with a mini bar showing stock relative to 2× the reorder level. */
export function StockLevel({ qty, reorder }: { qty: number; reorder: number }) {
  const s = stockState(qty, reorder);
  const scale = Math.max(reorder * 2, 1);
  const pct = Math.min(100, Math.round((qty / scale) * 100));
  return (
    <div className="flex items-center justify-end gap-2.5">
      <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-ink-100 sm:block" aria-hidden>
        <div
          className={cn('h-full rounded-full', s === 'out' ? 'bg-danger-500' : s === 'low' ? 'bg-warning-500' : 'bg-success-500')}
          style={{ width: `${Math.max(pct, s === 'out' ? 0 : 4)}%` }}
        />
      </div>
      <span className={cn('w-10 text-right font-medium tabular', s === 'out' ? 'text-danger-600' : s === 'low' ? 'text-warning-700' : 'text-ink-900')}>
        {qty}
      </span>
    </div>
  );
}

const reasonTone: Record<MovementReason, Tone> = {
  SALE: 'brand',
  PURCHASE: 'accent',
  ADJUSTMENT: 'neutral',
  RETURN: 'info',
};
const reasonLabel: Record<MovementReason, string> = {
  SALE: 'Sale',
  PURCHASE: 'Purchase',
  ADJUSTMENT: 'Adjustment',
  RETURN: 'Return',
};

export function MovementReasonBadge({ reason }: { reason: MovementReason }) {
  return <Badge tone={reasonTone[reason]}>{reasonLabel[reason]}</Badge>;
}

export function QtyDelta({ value }: { value: number }) {
  return (
    <span className={cn('font-medium tabular', value > 0 ? 'text-success-700' : 'text-danger-600')}>
      {value > 0 ? '+' : '−'}
      {Math.abs(value)}
    </span>
  );
}

const roleTone: Record<Role, Tone> = { ADMIN: 'brand', MANAGER: 'info', STAFF: 'neutral' };
export function RoleBadge({ role }: { role: Role }) {
  return <Badge tone={roleTone[role]}>{role.charAt(0) + role.slice(1).toLowerCase()}</Badge>;
}
