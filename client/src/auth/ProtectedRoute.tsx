import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Boxes } from 'lucide-react';
import { useAuth } from './AuthContext';
import type { Role } from '../types';

/** Guards routes by authentication and (optionally) role. */
export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-3 text-sm text-ink-500">
          <span className="grid h-10 w-10 animate-pulse place-items-center rounded-xl bg-sidebar text-sand-300">
            <Boxes className="h-5 w-5" />
          </span>
          Loading your workspace…
        </div>
      </div>
    );
  }
  // Remember where the user was headed so login can send them back.
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
