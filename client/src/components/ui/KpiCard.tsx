import { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Skeleton } from './States';

export function KpiCard({
  label,
  value,
  icon,
  delta,
  deltaLabel,
  invertDelta,
  context,
  loading,
  tone = 'brand',
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  /** Percent change vs the comparison period; null = no baseline. */
  delta?: number | null;
  deltaLabel?: string;
  /** For metrics where "down" is good (e.g. spend). */
  invertDelta?: boolean;
  context?: ReactNode;
  loading?: boolean;
  tone?: 'brand' | 'accent' | 'info' | 'warning' | 'danger' | 'success';
}) {
  const toneCls = {
    brand: 'bg-brand-50 text-brand-600',
    accent: 'bg-almond-100 text-almond-700',
    info: 'bg-info-100 text-info-700',
    warning: 'bg-warning-50 text-warning-700',
    danger: 'bg-danger-50 text-danger-600',
    success: 'bg-success-50 text-success-700',
  }[tone];

  let deltaEl: ReactNode = null;
  if (delta !== undefined) {
    if (delta === null) {
      deltaEl = <span className="text-xs text-ink-500">No prior data</span>;
    } else {
      const up = delta > 0.05;
      const down = delta < -0.05;
      const good = invertDelta ? down : up;
      const bad = invertDelta ? up : down;
      deltaEl = (
        <span
          className={cn(
            'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium tabular',
            good && 'bg-success-50 text-success-700',
            bad && 'bg-danger-50 text-danger-700',
            !good && !bad && 'bg-ink-100 text-ink-600',
          )}
        >
          {up ? <ArrowUpRight className="h-3 w-3" /> : down ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          {Math.abs(delta).toFixed(1)}%
        </span>
      );
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-ink-200 bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-500">{label}</span>
        <span className={cn('grid h-8 w-8 place-items-center rounded-lg [&>svg]:h-4 [&>svg]:w-4', toneCls)}>{icon}</span>
      </div>
      {loading ? (
        <>
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-36" />
        </>
      ) : (
        <>
          <div className="font-display text-[30px] leading-tight text-ink-900">{value}</div>
          <div className="flex min-h-[22px] flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
            {deltaEl}
            {deltaLabel && delta !== undefined && delta !== null && <span>{deltaLabel}</span>}
            {context}
          </div>
        </>
      )}
    </div>
  );
}
