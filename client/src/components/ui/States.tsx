import { ReactNode } from 'react';
import { AlertCircle, RotateCw } from 'lucide-react';
import { Button } from './Button';
import { cn } from '../../lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-ink-200/70', className)} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {icon && (
        <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl border border-ink-200 bg-ink-50 text-ink-400">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-ink-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)} role="alert">
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-danger-50 text-danger-600">
        <AlertCircle className="h-5 w-5" />
      </div>
      <p className="text-sm font-semibold text-ink-900">Couldn't load this data</p>
      <p className="mt-1 max-w-sm text-sm text-ink-500">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" icon={<RotateCw className="h-3.5 w-3.5" />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function InlineAlert({ tone = 'danger', children }: { tone?: 'danger' | 'warning' | 'info'; children: ReactNode }) {
  const styles = {
    danger: 'border-danger-200 bg-danger-50 text-danger-800',
    warning: 'border-warning-200 bg-warning-50 text-warning-900',
    info: 'border-info-200 bg-info-50 text-info-900',
  }[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-2 rounded-lg border px-3 py-2.5 text-sm', styles)}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
