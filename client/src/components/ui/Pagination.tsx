import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';
import { count } from '../../lib/format';
import type { Pagination as P } from '../../types';

export function Pagination({ pagination, onPage }: { pagination?: P; onPage: (page: number) => void }) {
  if (!pagination || pagination.total === 0) return null;
  const { page, limit, total, totalPages } = pagination;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 px-4 py-3 text-sm">
      <p className="text-ink-500">
        Showing <span className="font-medium text-ink-900 tabular">{count(from)}–{count(to)}</span> of{' '}
        <span className="font-medium text-ink-900 tabular">{count(total)}</span>
      </p>
      <div className="flex items-center gap-2">
        <span className="hidden text-xs text-ink-500 sm:inline">
          Page {page} of {Math.max(totalPages, 1)}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          icon={<ChevronLeft className="h-3.5 w-3.5" />}
          aria-label="Previous page"
        >
          Prev
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
          className="flex-row-reverse"
          icon={<ChevronRight className="h-3.5 w-3.5" />}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
