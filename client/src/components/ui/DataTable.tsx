import { ReactNode, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { Skeleton, ErrorState } from './States';
import { cn } from '../../lib/cn';

export interface SortState {
  key: string;
  order: 'asc' | 'desc';
}

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Enables sorting. Server-sorted tables only need `sortable`; client-sorted tables need `sortValue`. */
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  align?: 'left' | 'right' | 'center';
  /** Hide on narrow screens to keep the table readable on mobile. */
  hideBelow?: 'sm' | 'md' | 'lg';
  className?: string;
  width?: string;
}

const hide = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };
const alignCls = { left: 'text-left', right: 'text-right', center: 'text-center' };

interface Props<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string | number;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  /** Controlled (server-side) sorting. Omit for client-side sorting via `sortValue`. */
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  defaultSort?: SortState;
  skeletonRows?: number;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  empty,
  onRowClick,
  sort,
  onSortChange,
  defaultSort,
  skeletonRows = 6,
}: Props<T>) {
  const controlled = !!onSortChange;
  const [localSort, setLocalSort] = useState<SortState | undefined>(defaultSort);
  const activeSort = controlled ? sort : localSort;

  const sortedRows = useMemo(() => {
    if (!rows || controlled || !localSort) return rows;
    const col = columns.find((c) => c.key === localSort.key);
    if (!col?.sortValue) return rows;
    const dir = localSort.order === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      return (typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))) * dir;
    });
  }, [rows, columns, controlled, localSort]);

  const toggleSort = (key: string) => {
    const next: SortState =
      activeSort?.key === key ? { key, order: activeSort.order === 'asc' ? 'desc' : 'asc' } : { key, order: 'asc' };
    if (controlled) onSortChange!(next);
    else setLocalSort(next);
  };

  if (error && !rows?.length) return <ErrorState message={error} onRetry={onRetry} />;

  const showSkeleton = loading && !rows;

  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-full text-sm">
        <thead>
          <tr className="border-b border-ink-200 bg-sand-50">
            {columns.map((c) => {
              const isSorted = activeSort?.key === c.key;
              const canSort = c.sortable || !!c.sortValue;
              return (
                <th
                  key={c.key}
                  scope="col"
                  style={c.width ? { width: c.width } : undefined}
                  aria-sort={isSorted ? (activeSort!.order === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn(
                    'whitespace-nowrap px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-ink-500',
                    alignCls[c.align ?? 'left'],
                    c.hideBelow && hide[c.hideBelow],
                  )}
                >
                  {canSort ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={cn(
                        // Buttons don't inherit text-transform (Tailwind preflight), so repeat the header style.
                        'inline-flex items-center gap-1 rounded uppercase tracking-wider hover:text-ink-900',
                        isSorted && 'text-ink-900',
                        c.align === 'right' && 'flex-row-reverse',
                      )}
                    >
                      {c.header}
                      {isSorted ? (
                        activeSort!.order === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className={cn('divide-y divide-ink-100', loading && rows && 'opacity-60 transition-opacity')}>
          {showSkeleton
            ? Array.from({ length: skeletonRows }, (_, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key} className={cn('px-4 py-3.5', c.hideBelow && hide[c.hideBelow])}>
                      <Skeleton className="h-4 w-full max-w-[140px]" />
                    </td>
                  ))}
                </tr>
              ))
            : sortedRows?.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cn('group bg-surface', onRowClick && 'cursor-pointer hover:bg-blush-50 focus:bg-blush-50')}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-4 py-3 align-middle text-ink-700',
                        alignCls[c.align ?? 'left'],
                        c.hideBelow && hide[c.hideBelow],
                        c.className,
                      )}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
      {!showSkeleton && rows && rows.length === 0 && empty}
    </div>
  );
}
