import { Link } from 'react-router-dom';
import { ScrollText } from 'lucide-react';
import { activityApi } from '../api/resources';
import { useAsync } from '../hooks/useAsync';
import { useUrlState } from '../hooks/useUrlState';
import { count, dateTime, relativeTime } from '../lib/format';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Column, DataTable } from '../components/ui/DataTable';
import { Pagination } from '../components/ui/Pagination';
import { Segmented, Toolbar } from '../components/ui/Toolbar';
import { EmptyState } from '../components/ui/States';
import { RoleBadge } from '../components/domain/Badges';
import type { ActivityEntry } from '../types';

type Entity = '' | 'product' | 'order' | 'supplier' | 'customer' | 'category' | 'user' | 'auth';

/** Human-readable sentence for an audit entry, from its action + metadata. */
function describe(a: ActivityEntry) {
  const m = (a.metadata ?? {}) as Record<string, unknown>;
  const s = (k: string) => (m[k] === undefined || m[k] === null ? '' : String(m[k]));
  switch (a.action) {
    case 'auth.login':
      return 'Signed in';
    case 'product.created':
      return `Created product ${s('name')} (${s('sku')})`;
    case 'product.updated':
      return `Updated product${Array.isArray(m.fields) ? ` — ${(m.fields as string[]).join(', ')}` : ''}`;
    case 'product.archived':
      return `Archived product ${s('name')} (${s('sku')})`;
    case 'stock.adjusted': {
      const qty = Number(m.changeQty);
      return `Adjusted stock of ${s('sku')} by ${qty > 0 ? '+' : ''}${qty} (${s('reason').toLowerCase()})${m.note ? ` — “${s('note')}”` : ''}`;
    }
    case 'order.created':
      return `${s('status') === 'PENDING' ? 'Saved draft' : 'Created'} ${s('type') === 'SALE' ? 'sale' : 'purchase order'} ${s('orderNumber')}`;
    case 'seed.demo_transactions':
      return 'Loaded demo transactions';
    case 'order.status_changed':
      return `Changed ${s('orderNumber')} from ${s('from').toLowerCase()} to ${s('to').toLowerCase()}`;
    case 'supplier.created':
      return `Added supplier ${s('name')}`;
    case 'supplier.updated':
      return 'Updated supplier details';
    case 'customer.created':
      return `Added customer ${s('name')}${m.source ? ` (from a ${s('source')})` : ''}`;
    case 'customer.updated':
      return `Updated customer ${s('name')}${Array.isArray(m.fields) && m.fields.length ? ` — ${(m.fields as string[]).join(', ')}` : ''}`;
    case 'customer.archived':
      return `Archived customer ${s('name')}`;
    case 'customer.restored':
      return `Restored customer ${s('name')}`;
    case 'customer.deleted':
      return `Deleted customer ${s('name')}`;
    case 'category.created':
      return `Created category ${s('name')}`;
    case 'category.updated':
      return 'Updated category';
    case 'user.created':
      return `Added team member ${s('email')} as ${s('role').toLowerCase()}`;
    case 'user.updated': {
      const parts = [];
      if (m.role) parts.push(`role → ${s('role').toLowerCase()}`);
      if (m.isActive !== undefined) parts.push(m.isActive ? 'reactivated' : 'deactivated');
      return `Updated ${s('email')}${parts.length ? ` (${parts.join(', ')})` : ''}`;
    }
    default:
      return a.action;
  }
}

function linkFor(a: ActivityEntry) {
  if (a.entity === 'order' && a.entityId) return `/orders?order=${a.entityId}`;
  if (a.entity === 'supplier' && a.entityId) return `/suppliers?supplier=${a.entityId}`;
  if (a.entity === 'customer' && a.entityId && a.action !== 'customer.deleted') return `/customers?customer=${a.entityId}`;
  return null;
}

export default function ActivityPage() {
  const [f, setF] = useUrlState({ entity: '', page: '1' });
  const page = Number(f.page) || 1;
  const { data, loading, error, reload } = useAsync(
    () => activityApi.list({ entity: f.entity, page, limit: 25 }).then((r) => r.data),
    [f.entity, page],
  );

  const columns: Column<ActivityEntry>[] = [
    {
      key: 'when',
      header: 'When',
      cell: (a) => (
        <span className="whitespace-nowrap text-ink-600" title={dateTime(a.createdAt)}>
          {relativeTime(a.createdAt)}
        </span>
      ),
    },
    {
      key: 'who',
      header: 'User',
      cell: (a) =>
        a.user ? (
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink-900">{a.user.name}</span>
            <span className="hidden sm:inline">
              <RoleBadge role={a.user.role} />
            </span>
          </div>
        ) : (
          <span className="text-ink-400">System</span>
        ),
    },
    {
      key: 'what',
      header: 'Activity',
      cell: (a) => {
        const href = linkFor(a);
        return href ? (
          <Link to={href} className="text-ink-700 hover:text-brand-700 hover:underline">
            {describe(a)}
          </Link>
        ) : (
          <span className="text-ink-700">{describe(a)}</span>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit log"
        description={data ? `${count(data.pagination.total)} recorded actions. Entries can't be edited or deleted.` : 'Who did what, and when'}
      />
      <Card>
        <Toolbar>
          <Segmented<Entity>
            label="Activity type"
            value={f.entity as Entity}
            onChange={(v) => setF({ entity: v })}
            options={[
              { value: '', label: 'All' },
              { value: 'order', label: 'Orders' },
              { value: 'product', label: 'Inventory' },
              { value: 'supplier', label: 'Suppliers' },
              { value: 'customer', label: 'Customers' },
              { value: 'category', label: 'Categories' },
              { value: 'user', label: 'Team' },
              { value: 'auth', label: 'Sign-ins' },
            ]}
          />
        </Toolbar>
        <DataTable
          columns={columns}
          rows={data?.data}
          rowKey={(a) => a.id}
          loading={loading}
          error={error}
          onRetry={reload}
          empty={
            <EmptyState
              icon={<ScrollText className="h-5 w-5" />}
              title="No activity recorded yet"
              description="Actions like creating orders, adjusting stock and changing roles are logged here from now on."
            />
          }
        />
        <Pagination pagination={data?.pagination} onPage={(p) => setF({ page: String(p) }, { resetPage: false })} />
      </Card>
    </div>
  );
}
