import { useEffect, useState } from 'react';
import { Archive, Download, Eye, Package, Pencil, Plus, SlidersHorizontal } from 'lucide-react';
import { productsApi } from '../api/resources';
import { useAuth } from '../auth/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { useDebounce } from '../hooks/useDebounce';
import { useReferenceData } from '../hooks/useReferenceData';
import { useUrlState } from '../hooks/useUrlState';
import { canManageInventory } from '../lib/permissions';
import { getErrorMessage } from '../lib/errors';
import { count, money } from '../lib/format';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Column, DataTable } from '../components/ui/DataTable';
import { Pagination } from '../components/ui/Pagination';
import { FilterSelect, SearchInput, Segmented, Toolbar } from '../components/ui/Toolbar';
import { EmptyState } from '../components/ui/States';
import { RowMenu } from '../components/ui/Menu';
import { ConfirmDialog } from '../components/ui/Overlay';
import { useToast } from '../components/ui/Toast';
import { StockBadge, StockLevel } from '../components/domain/Badges';
import { ProductFormModal } from '../features/products/ProductFormModal';
import { AdjustStockModal } from '../features/products/AdjustStockModal';
import { ProductDrawer } from '../features/products/ProductDrawer';
import type { Product, StockFilter } from '../types';

const PAGE_SIZE = 15;

export default function ProductsPage() {
  const { user } = useAuth();
  const canManage = canManageInventory(user?.role);
  const toast = useToast();
  const { categories, suppliers, reload: reloadRefs } = useReferenceData();

  const [f, setF] = useUrlState({ q: '', stock: '', category: '', supplier: '', sort: 'name', order: 'asc', page: '1' });
  const [searchText, setSearchText] = useState(f.q);
  const debounced = useDebounce(searchText, 300);
  useEffect(() => {
    if (debounced !== f.q) setF({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const page = Number(f.page) || 1;
  const { data, loading, error, reload } = useAsync(
    () =>
      productsApi
        .list({ search: f.q, stock: f.stock, categoryId: f.category, supplierId: f.supplier, sort: f.sort, order: f.order, page, limit: PAGE_SIZE })
        .then((r) => r.data),
    [f.q, f.stock, f.category, f.supplier, f.sort, f.order, page],
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [archiving, setArchiving] = useState<Product | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [viewing, setViewing] = useState<Product | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (p: Product) => {
    setEditing(p);
    setFormOpen(true);
  };

  const afterSave = (p: Product) => {
    reload();
    if (viewing?.id === p.id) setViewing({ ...viewing, ...p });
    setHistoryVersion((v) => v + 1);
  };

  const confirmArchive = async () => {
    if (!archiving) return;
    setArchiveBusy(true);
    try {
      await productsApi.archive(archiving.id);
      toast.success('Product archived', `${archiving.name} is hidden from the catalogue. Order history is kept.`);
      if (viewing?.id === archiving.id) setViewing(null);
      setArchiving(null);
      reload();
    } catch (err) {
      toast.error('Could not archive product', getErrorMessage(err));
    } finally {
      setArchiveBusy(false);
    }
  };

  const exportCsv = () => {
    if (!data?.data.length) return;
    const head = ['SKU', 'Name', 'Category', 'Supplier', 'Unit price', 'Cost price', 'On hand', 'Reorder level'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = data.data.map((p) =>
      [p.sku, p.name, p.category?.name, p.supplier?.name, p.unitPrice, p.costPrice, p.quantityInStock, p.reorderLevel].map(esc).join(','),
    );
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `products-page-${page}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const columns: Column<Product>[] = [
    {
      key: 'name',
      header: 'Product',
      sortable: true,
      cell: (p) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{p.name}</p>
          <p className="mt-0.5 font-mono text-xs text-ink-500">{p.sku}</p>
        </div>
      ),
    },
    { key: 'category', header: 'Category', hideBelow: 'md', cell: (p) => <span className="text-ink-600">{p.category?.name ?? '—'}</span> },
    { key: 'supplier', header: 'Supplier', hideBelow: 'lg', cell: (p) => <span className="text-ink-600">{p.supplier?.name ?? '—'}</span> },
    { key: 'unitPrice', header: 'Price', sortable: true, align: 'right', hideBelow: 'sm', cell: (p) => <span className="tabular">{money(p.unitPrice)}</span> },
    {
      key: 'quantityInStock',
      header: 'On hand',
      sortable: true,
      align: 'right',
      cell: (p) => <StockLevel qty={p.quantityInStock} reorder={p.reorderLevel} />,
    },
    { key: 'status', header: 'Status', hideBelow: 'sm', cell: (p) => <StockBadge qty={p.quantityInStock} reorder={p.reorderLevel} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      width: '56px',
      cell: (p) => (
        <RowMenu
          items={[
            { label: 'View details', icon: <Eye />, onSelect: () => setViewing(p) },
            ...(canManage
              ? [
                  { label: 'Edit', icon: <Pencil />, onSelect: () => openEdit(p) },
                  { label: 'Adjust stock', icon: <SlidersHorizontal />, onSelect: () => setAdjusting(p) },
                  { label: 'Archive', icon: <Archive />, danger: true, onSelect: () => setArchiving(p) },
                ]
              : []),
          ]}
        />
      ),
    },
  ];

  const filtersActive = !!(f.q || f.stock || f.category || f.supplier);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Products"
        description={data ? `${count(data.pagination.total)} ${filtersActive ? 'matching' : 'active'} products` : 'Your catalogue and stock levels'}
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={exportCsv} disabled={!data?.data.length}>
              Export CSV
            </Button>
            {canManage && (
              <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={openCreate}>
                New product
              </Button>
            )}
          </>
        }
      />

      <Card>
        <Toolbar>
          <SearchInput value={searchText} onChange={setSearchText} placeholder="Search name or SKU" />
          <Segmented<'' | StockFilter>
            label="Stock status"
            value={f.stock as '' | StockFilter}
            onChange={(v) => setF({ stock: v })}
            options={[
              { value: '', label: 'All' },
              { value: 'in', label: 'In stock' },
              { value: 'low', label: 'Low' },
              { value: 'out', label: 'Out' },
            ]}
          />
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:justify-end">
            <FilterSelect
              label="Category"
              value={f.category}
              onChange={(v) => setF({ category: v })}
              options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
            />
            <FilterSelect
              label="Supplier"
              value={f.supplier}
              onChange={(v) => setF({ supplier: v })}
              options={suppliers.map((s) => ({ value: String(s.id), label: s.name }))}
            />
          </div>
        </Toolbar>
        <DataTable
          columns={columns}
          rows={data?.data}
          rowKey={(p) => p.id}
          loading={loading}
          error={error}
          onRetry={reload}
          onRowClick={setViewing}
          sort={{ key: f.sort, order: f.order as 'asc' | 'desc' }}
          onSortChange={(s) => setF({ sort: s.key, order: s.order })}
          empty={
            filtersActive ? (
              <EmptyState
                icon={<Package className="h-5 w-5" />}
                title="No products match these filters"
                description="Try a different search term or clear the filters."
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSearchText('');
                      setF({ q: '', stock: '', category: '', supplier: '' });
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={<Package className="h-5 w-5" />}
                title="No products yet"
                description="Add your first product to start tracking stock."
                action={canManage && <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={openCreate}>New product</Button>}
              />
            )
          }
        />
        <Pagination pagination={data?.pagination} onPage={(p) => setF({ page: String(p) }, { resetPage: false })} />
      </Card>

      <ProductFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        product={editing}
        categories={categories}
        suppliers={suppliers}
        onSaved={(p) => {
          afterSave(p);
          reloadRefs();
        }}
      />
      <AdjustStockModal product={adjusting} onClose={() => setAdjusting(null)} onSaved={afterSave} />
      <ConfirmDialog
        open={!!archiving}
        onClose={() => setArchiving(null)}
        onConfirm={confirmArchive}
        loading={archiveBusy}
        title="Archive product?"
        confirmLabel="Archive product"
        message={
          <>
            <strong className="text-ink-900">{archiving?.name}</strong> will be removed from the catalogue and can no longer be ordered.
            Its stock history and past orders are kept.
          </>
        }
      />
      <ProductDrawer
        product={viewing}
        canManage={canManage}
        onClose={() => setViewing(null)}
        onEdit={openEdit}
        onAdjust={setAdjusting}
        version={historyVersion}
      />
    </div>
  );
}
