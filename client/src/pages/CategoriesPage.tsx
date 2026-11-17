import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Plus, Tags } from 'lucide-react';
import { categoriesApi } from '../api/resources';
import { useAuth } from '../auth/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { canManageInventory } from '../lib/permissions';
import { apiError, getErrorMessage } from '../lib/errors';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Column, DataTable } from '../components/ui/DataTable';
import { EmptyState, InlineAlert } from '../components/ui/States';
import { Modal } from '../components/ui/Overlay';
import { Field, Input, Textarea } from '../components/ui/Field';
import { useToast } from '../components/ui/Toast';
import type { Category } from '../types';

export default function CategoriesPage() {
  const { user } = useAuth();
  const canManage = canManageInventory(user?.role);
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsync(() => categoriesApi.list().then((r) => r.data.data), []);
  const [editing, setEditing] = useState<Category | null>(null);
  const [open, setOpen] = useState(false);

  const columns: Column<Category>[] = [
    { key: 'name', header: 'Category', sortValue: (c) => c.name.toLowerCase(), cell: (c) => <span className="font-medium text-ink-900">{c.name}</span> },
    { key: 'desc', header: 'Description', hideBelow: 'sm', cell: (c) => <span className="line-clamp-1 text-ink-600">{c.description || '—'}</span> },
    { key: 'products', header: 'Active products', align: 'right', sortValue: (c) => c._count?.products ?? 0, cell: (c) => <span className="tabular">{c._count?.products ?? 0}</span> },
    ...(canManage
      ? [
          {
            key: 'edit',
            header: <span className="sr-only">Edit</span>,
            align: 'right' as const,
            width: '56px',
            cell: (c: Category) => (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit ${c.name}`}
                className="h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(c);
                  setOpen(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Categories"
        description="Group products for filtering and reporting. Select a category to see its products."
        actions={
          canManage && (
            <Button
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              New category
            </Button>
          )
        }
      />
      <Card>
        <DataTable
          columns={columns}
          rows={data}
          rowKey={(c) => c.id}
          loading={loading}
          error={error}
          onRetry={reload}
          defaultSort={{ key: 'name', order: 'asc' }}
          onRowClick={(c) => navigate(`/products?category=${c.id}`)}
          empty={<EmptyState icon={<Tags className="h-5 w-5" />} title="No categories yet" description="Create categories like “Electronics” or “Stationery”." />}
        />
      </Card>
      <CategoryModal
        open={open}
        category={editing}
        onClose={() => setOpen(false)}
        onSaved={() => {
          setOpen(false);
          reload();
        }}
      />
    </div>
  );
}

function CategoryModal({ open, category, onClose, onSaved }: { open: boolean; category: Category | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? '');
    setDescription(category?.description ?? '');
    setNameError(null);
    setError(null);
  }, [open, category]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setNameError('Name must be at least 2 characters');
    setSaving(true);
    setError(null);
    try {
      const body = { name: name.trim(), description: description.trim() || undefined };
      if (category) await categoriesApi.update(category.id, body);
      else await categoriesApi.create(body);
      toast.success(category ? 'Category updated' : 'Category created', body.name);
      onSaved();
    } catch (err) {
      const { error: code } = apiError(err);
      if (code === 'NAME_TAKEN' || code === 'CONFLICT') setNameError('A category with this name already exists');
      else setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={category ? 'Edit category' : 'New category'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="category-form" loading={saving}>
            {category ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <form id="category-form" onSubmit={submit} noValidate className="space-y-4">
        {error && <InlineAlert>{error}</InlineAlert>}
        <Field label="Name" required error={nameError}>
          <Input value={name} onChange={(e) => { setName(e.target.value); setNameError(null); }} maxLength={60} invalid={!!nameError} />
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
        </Field>
      </form>
    </Modal>
  );
}
