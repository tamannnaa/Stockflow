import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight } from 'lucide-react';
import { stockMovementsApi } from '../api/resources';
import { useAsync } from '../hooks/useAsync';
import { useDebounce } from '../hooks/useDebounce';
import { useUrlState } from '../hooks/useUrlState';
import { count, dateTime, relativeTime } from '../lib/format';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Column, DataTable } from '../components/ui/DataTable';
import { Pagination } from '../components/ui/Pagination';
import { SearchInput, Segmented, Toolbar } from '../components/ui/Toolbar';
import { EmptyState } from '../components/ui/States';
import { MovementReasonBadge, QtyDelta } from '../components/domain/Badges';
import type { MovementReason, StockMovement } from '../types';

export default function StockMovementsPage() {
  const [f, setF] = useUrlState({ reason: '', q: '', page: '1' });
  const [searchText, setSearchText] = useState(f.q);
  const debounced = useDebounce(searchText, 300);
  useEffect(() => {
    if (debounced !== f.q) setF({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const page = Number(f.page) || 1;
  const { data, loading, error, reload } = useAsync(
    () => stockMovementsApi.list({ reason: f.reason, search: f.q, page, limit: 25 }).then((r) => r.data),
    [f.reason, f.q, page],
  );

  const columns: Column<StockMovement>[] = [
    {
      key: 'when',
      header: 'When',
      cell: (m) => (
        <span className="whitespace-nowrap text-ink-600" title={dateTime(m.createdAt)}>
          {relativeTime(m.createdAt)}
        </span>
      ),
    },
    {
      key: 'product',
      header: 'Product',
      cell: (m) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{m.product?.name}</p>
          <p className="font-mono text-xs text-ink-500">{m.product?.sku}</p>
        </div>
      ),
    },
    { key: 'reason', header: 'Type', cell: (m) => <MovementReasonBadge reason={m.reason} /> },
    { key: 'change', header: 'Change', align: 'right', cell: (m) => <QtyDelta value={m.changeQty} /> },
    {
      key: 'ref',
      header: 'Reference',
      hideBelow: 'md',
      cell: (m) =>
        m.order ? (
          <Link to={`/orders?order=${m.order.id}`} className="font-mono text-xs text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()}>
            {m.order.orderNumber}
          </Link>
        ) : (
          <span className="text-xs text-ink-400">Manual</span>
        ),
    },
    { key: 'by', header: 'By', hideBelow: 'lg', cell: (m) => <span className="text-ink-600">{m.createdBy?.name ?? '—'}</span> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stock movements"
        description={
          data
            ? `${count(data.pagination.total)} entries in the stock ledger. Every sale, purchase, return and adjustment is recorded here and can't be edited.`
            : 'The audit trail behind every stock level'
        }
      />
      <Card>
        <Toolbar>
          <Segmented<'' | MovementReason>
            label="Movement type"
            value={f.reason as '' | MovementReason}
            onChange={(v) => setF({ reason: v })}
            options={[
              { value: '', label: 'All' },
              { value: 'SALE', label: 'Sales' },
              { value: 'PURCHASE', label: 'Purchases' },
              { value: 'RETURN', label: 'Returns' },
              { value: 'ADJUSTMENT', label: 'Adjustments' },
            ]}
          />
          <SearchInput value={searchText} onChange={setSearchText} placeholder="Filter by product name or SKU" className="sm:ml-auto" />
        </Toolbar>
        <DataTable
          columns={columns}
          rows={data?.data}
          rowKey={(m) => m.id}
          loading={loading}
          error={error}
          onRetry={reload}
          empty={
            <EmptyState
              icon={<ArrowLeftRight className="h-5 w-5" />}
              title={f.reason || f.q ? 'No movements match these filters' : 'No stock movements yet'}
              description="Movements are created automatically by orders and stock adjustments."
            />
          }
        />
        <Pagination pagination={data?.pagination} onPage={(p) => setF({ page: String(p) }, { resetPage: false })} />
      </Card>
    </div>
  );
}
