import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, ArrowRight, BarChart3, Boxes, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { getErrorMessage } from '../lib/errors';
import { Button } from '../components/ui/Button';
import { InlineAlert } from '../components/ui/States';
import { cn } from '../lib/cn';

// Seeded demo accounts — offered only in development builds.
const DEMO_ACCOUNTS = import.meta.env.DEV
  ? [
      { role: 'Admin', email: 'admin@stockflow.dev' },
      { role: 'Manager', email: 'manager@stockflow.dev' },
      { role: 'Staff', email: 'staff@stockflow.dev' },
    ]
  : [];
const DEMO_PASSWORD = 'Password123!';

export default function LoginPage() {
  const { login, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(DEMO_ACCOUNTS[0]?.email ?? '');
  const [password, setPassword] = useState(DEMO_ACCOUNTS.length ? DEMO_PASSWORD : '');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!authLoading && user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Sign-in failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Form side */}
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-sidebar text-sand-300">
            <Boxes className="h-[18px] w-[18px]" />
          </span>
          <span className="font-display text-2xl text-ink-900">Stockflow</span>
        </div>

        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-12">
          <p className="text-xs uppercase tracking-[0.18em] text-brand-600">Welcome back</p>
          <h1 className="mt-2 font-display text-[40px] leading-[1.08] text-ink-900">Sign in to your workspace</h1>
          <p className="mt-3 text-sm text-ink-500">Inventory, orders and stock history, all in one place.</p>

          <form onSubmit={submit} noValidate className="mt-8 space-y-4">
            {error && <InlineAlert>{error}</InlineAlert>}

            <div className="space-y-1.5">
              <label htmlFor="login-email" className="text-xs text-ink-700">
                Work email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="control h-11 pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="login-password" className="text-xs text-ink-700">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={(e) => setCapsLock(e.getModifierState('CapsLock'))}
                  placeholder="••••••••"
                  className="control h-11 pl-10 pr-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-ink-400 hover:bg-blush-100 hover:text-ink-700"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {capsLock && <p className="text-xs text-warning-700">Caps Lock is on</p>}
            </div>

            <Button type="submit" loading={loading} className="h-11 w-full justify-center text-sm">
              {loading ? 'Signing in…' : 'Sign in'}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>

          {DEMO_ACCOUNTS.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center gap-3 text-2xs uppercase tracking-wider text-ink-400">
                <span className="h-px flex-1 bg-ink-200" />
                Demo accounts · dev only
                <span className="h-px flex-1 bg-ink-200" />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {DEMO_ACCOUNTS.map((a) => (
                  <button
                    key={a.email}
                    type="button"
                    onClick={() => {
                      setEmail(a.email);
                      setPassword(DEMO_PASSWORD);
                      setError(null);
                    }}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-xs transition-colors',
                      email === a.email
                        ? 'border-blush-300 bg-blush-100 text-ink-900'
                        : 'border-ink-200 bg-surface text-ink-600 hover:border-blush-200 hover:bg-blush-50',
                    )}
                  >
                    {a.role}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-ink-500">© {new Date().getFullYear()} Stockflow · Inventory & order management</p>
      </div>

      {/* Brand side — Blue Slate surface with warm palette accents */}
      <div className="relative hidden overflow-hidden bg-sidebar lg:flex lg:flex-col lg:justify-between lg:p-14">
        <div className="pointer-events-none absolute -right-28 -top-28 h-[28rem] w-[28rem] rounded-full bg-blush-300/25 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-[26rem] w-[26rem] rounded-full bg-sand-300/20 blur-3xl" aria-hidden />

        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-md border border-sand-300/30 bg-white/5 px-3 py-1 text-xs text-sand-100">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Built for small retailers & warehouses
          </span>
        </div>

        <div className="relative">
          <StockIllustration />
          <h2 className="mt-10 max-w-md font-display text-[46px] leading-[1.05] text-white">
            Every unit accounted for, from <em className="text-sand-300">purchase</em> to sale.
          </h2>
          <ul className="mt-8 grid max-w-lg gap-4">
            {[
              { icon: ArrowLeftRight, title: 'Atomic stock changes', body: 'Each order and its stock update succeed or fail together, so stock never goes negative.' },
              { icon: BarChart3, title: 'Live KPIs', body: 'Revenue, purchases and inventory value, compared period over period.' },
              { icon: ShieldCheck, title: 'Roles & audit trail', body: 'Admins, managers and staff see what they need. Every change is logged.' },
            ].map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-blush-300 ring-1 ring-inset ring-white/15">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm text-white">{title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-sand-100/75">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-sand-200/70">Your data stays in your own PostgreSQL database.</p>
      </div>
    </div>
  );
}

/** Decorative stacked-crates illustration, coloured from the brand tokens (no data). */
function StockIllustration() {
  return (
    <svg viewBox="0 0 260 150" className="h-36 w-auto animate-float" role="img" aria-label="Stacked inventory crates">
      <rect x="10" y="132" width="240" height="6" rx="3" className="fill-sand-300/40" />
      <Crate x={30} y={82} w={70} h={50} top="fill-sand-300" side="fill-almond-500" />
      <Crate x={104} y={82} w={70} h={50} top="fill-blush-300" side="fill-brand-500" />
      <Crate x={178} y={92} w={56} h={40} top="fill-sand-100" side="fill-sand-300" />
      <Crate x={62} y={38} w={64} h={44} top="fill-blush-100" side="fill-blush-300" />
      <Crate x={130} y={46} w={50} h={36} top="fill-sand-200" side="fill-almond-400" />
      <g transform="translate(196 40)">
        <rect width="46" height="26" rx="6" className="fill-brand-500" />
        <rect x="8" y="9" width="22" height="3" rx="1.5" className="fill-sand-50" />
        <rect x="8" y="15" width="14" height="3" rx="1.5" className="fill-sand-50/70" />
      </g>
    </svg>
  );
}

function Crate({ x, y, w, h, top, side }: { x: number; y: number; w: number; h: number; top: string; side: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="5" className={top} />
      <rect x={x} y={y + h - 10} width={w} height="10" rx="3" className={side} />
      <rect x={x + w / 2 - 9} y={y} width="18" height={h - 10} className={cn(side, 'opacity-55')} />
    </g>
  );
}
