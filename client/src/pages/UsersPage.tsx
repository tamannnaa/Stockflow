import { FormEvent, useEffect, useState } from 'react';
import { ShieldCheck, UserPlus, UserX, UserCheck, Users } from 'lucide-react';
import { usersApi } from '../api/resources';
import { useAuth } from '../auth/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { apiError, getErrorMessage } from '../lib/errors';
import { date, initials } from '../lib/format';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Column, DataTable } from '../components/ui/DataTable';
import { EmptyState, InlineAlert } from '../components/ui/States';
import { ConfirmDialog, Modal } from '../components/ui/Overlay';
import { Field, Input, Select } from '../components/ui/Field';
import { RowMenu } from '../components/ui/Menu';
import { useToast } from '../components/ui/Toast';
import type { Role, User } from '../types';

const ROLE_HELP: Record<Role, string> = {
  ADMIN: 'Everything, including team management',
  MANAGER: 'Products, stock, purchases, order status, audit log',
  STAFF: 'View inventory and record sales',
};

export default function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(() => usersApi.list().then((r) => r.data.data), []);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [toggling, setToggling] = useState<User | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const changeRole = async (u: User, role: Role) => {
    if (role === u.role) return;
    setBusyId(u.id);
    try {
      await usersApi.update(u.id, { role });
      toast.success('Role updated', `${u.name} is now ${role.toLowerCase()}. Takes effect at their next sign-in or token refresh (≤ 15 min).`);
      reload();
    } catch (err) {
      toast.error('Role not changed', getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const confirmToggle = async () => {
    if (!toggling) return;
    setBusyId(toggling.id);
    try {
      await usersApi.update(toggling.id, { isActive: !toggling.isActive });
      toast.success(toggling.isActive ? 'User deactivated' : 'User reactivated', toggling.name);
      setToggling(null);
      reload();
    } catch (err) {
      toast.error('Could not update user', getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'Member',
      sortValue: (u) => u.name.toLowerCase(),
      cell: (u) => (
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">{initials(u.name)}</span>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">
              {u.name} {u.id === me?.id && <span className="ml-1 text-xs font-normal text-ink-400">(you)</span>}
            </p>
            <p className="truncate text-xs text-ink-500">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      sortValue: (u) => u.role,
      cell: (u) => (
        <Select
          aria-label={`Role for ${u.name}`}
          value={u.role}
          disabled={u.id === me?.id || busyId === u.id}
          onChange={(e) => changeRole(u, e.target.value as Role)}
          onClick={(e) => e.stopPropagation()}
          className="w-32 py-1.5 text-xs"
          title={u.id === me?.id ? "You can't change your own role" : undefined}
        >
          <option value="ADMIN">Admin</option>
          <option value="MANAGER">Manager</option>
          <option value="STAFF">Staff</option>
        </Select>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (u) => (u.isActive ? 0 : 1),
      cell: (u) => (u.isActive ? <Badge tone="success" dot>Active</Badge> : <Badge tone="neutral" dot>Deactivated</Badge>),
    },
    { key: 'joined', header: 'Joined', hideBelow: 'md', sortValue: (u) => u.createdAt, cell: (u) => <span className="text-ink-500">{date(u.createdAt)}</span> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      width: '56px',
      cell: (u) =>
        u.id === me?.id ? null : (
          <RowMenu
            items={[
              u.isActive
                ? { label: 'Deactivate', icon: <UserX />, danger: true, onSelect: () => setToggling(u) }
                : { label: 'Reactivate', icon: <UserCheck />, onSelect: () => setToggling(u) },
            ]}
          />
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Team"
        description="Manage who can sign in and what they can do."
        actions={
          <Button size="sm" icon={<UserPlus className="h-3.5 w-3.5" />} onClick={() => setInviteOpen(true)}>
            Add member
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {(Object.keys(ROLE_HELP) as Role[]).map((r) => (
          <div key={r} className="rounded-xl border border-ink-200 bg-surface px-4 py-3 shadow-card">
            <p className="flex items-center gap-2 text-sm font-medium text-ink-900">
              <ShieldCheck className="h-4 w-4 text-brand-600" /> {r.charAt(0) + r.slice(1).toLowerCase()}
              <span className="ml-auto text-xs font-normal text-ink-500 tabular">{data?.filter((u) => u.role === r && u.isActive).length ?? '–'} active</span>
            </p>
            <p className="mt-1 text-xs text-ink-500">{ROLE_HELP[r]}</p>
          </div>
        ))}
      </div>

      <Card>
        <DataTable
          columns={columns}
          rows={data}
          rowKey={(u) => u.id}
          loading={loading}
          error={error}
          onRetry={reload}
          defaultSort={{ key: 'name', order: 'asc' }}
          empty={<EmptyState icon={<Users className="h-5 w-5" />} title="No team members" />}
        />
      </Card>

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} onCreated={() => { setInviteOpen(false); reload(); }} />
      <ConfirmDialog
        open={!!toggling}
        onClose={() => setToggling(null)}
        onConfirm={confirmToggle}
        loading={busyId === toggling?.id}
        tone={toggling?.isActive ? 'danger' : 'primary'}
        title={toggling?.isActive ? `Deactivate ${toggling?.name}?` : `Reactivate ${toggling?.name}?`}
        confirmLabel={toggling?.isActive ? 'Deactivate' : 'Reactivate'}
        message={
          toggling?.isActive
            ? 'They will be unable to sign in. Their current session expires within 15 minutes. Their order and audit history is kept.'
            : 'They will be able to sign in again with their existing password.'
        }
      />
    </div>
  );
}

function InviteModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'STAFF' as Role });
  const [errors, setErrors] = useState<Partial<Record<'name' | 'email' | 'password', string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ name: '', email: '', password: '', role: 'STAFF' });
    setErrors({});
    setError(null);
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (form.name.trim().length < 2) errs.name = 'Name must be at least 2 characters';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errs.email = 'Enter a valid email address';
    if (form.password.length < 8) errs.password = 'At least 8 characters';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    setError(null);
    try {
      await usersApi.create({ ...form, name: form.name.trim(), email: form.email.trim() });
      toast.success('Member added', `${form.name} can now sign in with the password you set.`);
      onCreated();
    } catch (err) {
      if (apiError(err).error === 'EMAIL_TAKEN') setErrors({ email: 'This email is already registered' });
      else setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add team member"
      description="Share the temporary password with them securely."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="invite-form" loading={saving}>
            Add member
          </Button>
        </>
      }
    >
      <form id="invite-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        {error && (
          <div className="sm:col-span-2">
            <InlineAlert>{error}</InlineAlert>
          </div>
        )}
        <Field label="Full name" required error={errors.name}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} invalid={!!errors.name} />
        </Field>
        <Field label="Email" required error={errors.email}>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} invalid={!!errors.email} />
        </Field>
        <Field label="Temporary password" required error={errors.password} hint="At least 8 characters">
          <Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} invalid={!!errors.password} />
        </Field>
        <Field label="Role" hint={ROLE_HELP[form.role]}>
          <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            <option value="STAFF">Staff</option>
            <option value="MANAGER">Manager</option>
            <option value="ADMIN">Admin</option>
          </Select>
        </Field>
      </form>
    </Modal>
  );
}
