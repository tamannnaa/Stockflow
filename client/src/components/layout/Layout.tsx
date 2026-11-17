import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Boxes, CheckCheck, ChevronDown, LogOut, Menu, Plus, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { NAV, NavItem, titleFor } from './nav';
import { notificationsApi } from '../../api/resources';
import { initials, relativeTime } from '../../lib/format';
import { cn } from '../../lib/cn';
import { RoleBadge } from '../domain/Badges';
import { Button } from '../ui/Button';
import type { Notification } from '../../types';

export default function Layout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setMobileNavOpen(false), [location.pathname, location.search]);

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 bg-sidebar lg:block">
        <Sidebar />
      </aside>

      {/* Mobile sidebar */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-ink-900/40" onClick={() => setMobileNavOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-64 animate-slide-in-left bg-sidebar shadow-pop">
            <button
              onClick={() => setMobileNavOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1 text-sand-200 hover:bg-white/10"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
            <Sidebar />
          </aside>
        </div>
      )}

      <div className="lg:pl-60">
        <Topbar onMenu={() => setMobileNavOpen(true)} />
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Sidebar() {
  const { user } = useAuth();
  const location = useLocation();

  const isActive = (item: NavItem) => {
    if (item.search) return location.pathname === item.to && location.search.includes(item.search);
    if (item.to === '/') return location.pathname === '/';
    // Plain /orders (no type filter) highlights "Sales orders" as the default view.
    return location.pathname === item.to;
  };

  return (
    <div className="flex h-full flex-col">
      <Link to="/" className="flex h-14 items-center gap-2.5 border-b border-white/10 px-5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white shadow-sm">
          <Boxes className="h-4 w-4" />
        </span>
        <span className="font-display text-[22px] leading-none text-sand-100">Stockflow</span>
      </Link>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main">
        {NAV.map((section) => {
          const items = section.items.filter((i) => !i.roles || (user && i.roles.includes(user.role)));
          if (items.length === 0) return null;
          return (
            <div key={section.label}>
              <p className="mb-1.5 px-2 text-2xs uppercase tracking-[0.14em] text-sand-300/70">{section.label}</p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = isActive(item);
                  const Icon = item.icon;
                  return (
                    <li key={item.label}>
                      <Link
                        to={item.search ? `${item.to}?${item.search}` : item.to}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          // Active: Dusty Rose indicator bar + lifted surface; hover: soft light wash.
                          'relative flex items-center gap-2.5 rounded-lg py-1.5 pl-3 pr-2 text-sm transition-colors',
                          active
                            ? 'bg-white/[0.12] text-white before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-accent'
                            : 'text-sand-100/80 hover:bg-white/[0.07] hover:text-white',
                        )}
                      >
                        <Icon className={cn('h-4 w-4', active ? 'text-blush-300' : 'text-sand-300/60')} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      {user && (
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
            <Avatar name={user.name} className="bg-sand-300 text-ink-900" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-white">{user.name}</p>
              <p className="truncate text-xs text-sand-200/70">{user.email}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blush-200 text-xs text-ink-900', className)}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const title = titleFor(location.pathname, location.search);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-ink-200 bg-canvas/85 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button onClick={onMenu} className="-ml-1 rounded-md p-1.5 text-ink-500 hover:bg-blush-100 lg:hidden" aria-label="Open navigation">
        <Menu className="h-5 w-5" />
      </button>
      <p className="min-w-0 truncate text-sm font-medium text-ink-900">{title}</p>
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <Button
          size="sm"
          icon={<Plus className="h-3.5 w-3.5" />}
          onClick={() => navigate('/orders?type=SALE&new=1')}
          className="hidden sm:inline-flex"
        >
          New sale
        </Button>
        <NotificationsMenu />
        <UserMenu />
      </div>
    </header>
  );
}

/** Popover anchored to a trigger; closes on outside click / Escape. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

function NotificationsMenu() {
  const { open, setOpen, ref } = usePopover();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const location = useLocation();

  const load = () =>
    notificationsApi
      .list()
      .then((r) => {
        setItems(r.data.data);
        setUnread(r.data.unread);
      })
      .catch(() => undefined);

  // Refresh on navigation (orders/adjustments can create alerts) and every minute.
  useEffect(() => {
    load();
  }, [location.pathname]);
  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const markAll = async () => {
    await notificationsApi.markAllRead();
    load();
  };
  const markOne = async (n: Notification) => {
    if (n.isRead) return;
    await notificationsApi.markRead(n.id);
    load();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen(!open);
          if (!open) load();
        }}
        className="relative grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-blush-100 hover:text-ink-900"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-danger-500 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] animate-fade-in overflow-hidden rounded-xl border border-ink-200 bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <p className="text-sm font-semibold text-ink-900">Notifications</p>
            {unread > 0 && (
              <button onClick={markAll} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-900">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 divide-y divide-ink-100 overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-ink-500">
                You're all caught up. Low-stock alerts appear here when a product reaches its reorder level.
              </li>
            ) : (
              items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => markOne(n)}
                    className={cn('flex w-full gap-3 px-4 py-3 text-left hover:bg-ink-50', !n.isRead && 'bg-blush-50')}
                  >
                    <span
                      className={cn(
                        'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                        n.isRead ? 'bg-transparent' : n.type === 'OUT_OF_STOCK' ? 'bg-danger-500' : 'bg-warning-500',
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className={cn('block text-sm', n.isRead ? 'text-ink-600' : 'font-medium text-ink-900')}>{n.message}</span>
                      <span className="mt-0.5 block text-xs text-ink-400">{relativeTime(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <Link
            to="/products?stock=low"
            onClick={() => setOpen(false)}
            className="block border-t border-ink-100 px-4 py-2.5 text-center text-xs font-medium text-brand-700 hover:bg-ink-50"
          >
            View low-stock products
          </Link>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { open, setOpen, ref } = usePopover();
  if (!user) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg p-1 pr-1.5 hover:bg-ink-100"
        aria-label="Account menu"
        aria-expanded={open}
      >
        <Avatar name={user.name} className="h-7 w-7" />
        <ChevronDown className="hidden h-3.5 w-3.5 text-ink-400 sm:block" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-60 animate-fade-in rounded-xl border border-ink-200 bg-surface p-1 shadow-pop">
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-medium text-ink-900">{user.name}</p>
            <p className="truncate text-xs text-ink-500">{user.email}</p>
            <div className="mt-2">
              <RoleBadge role={user.role} />
            </div>
          </div>
          <div className="my-1 h-px bg-ink-100" />
          <button
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-ink-700 hover:bg-ink-100"
          >
            <LogOut className="h-4 w-4 text-ink-400" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
