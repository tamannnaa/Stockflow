import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import Layout from './components/layout/Layout';
import LoginPage from './pages/LoginPage';
import { Skeleton } from './components/ui/States';

// Route-level code splitting: charts (recharts) only load with the dashboard.
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const OrdersPage = lazy(() => import('./pages/OrdersPage'));
const StockMovementsPage = lazy(() => import('./pages/StockMovementsPage'));
const CategoriesPage = lazy(() => import('./pages/CategoriesPage'));
const SuppliersPage = lazy(() => import('./pages/SuppliersPage'));
const CustomersPage = lazy(() => import('./pages/CustomersPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const ActivityPage = lazy(() => import('./pages/ActivityPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function PageFallback() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading page">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-[420px] w-full rounded-xl" />
    </div>
  );
}

const page = (el: JSX.Element) => <Suspense fallback={<PageFallback />}>{el}</Suspense>;

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={page(<DashboardPage />)} />
          <Route path="/products" element={page(<ProductsPage />)} />
          <Route path="/stock-movements" element={page(<StockMovementsPage />)} />
          <Route path="/categories" element={page(<CategoriesPage />)} />
          <Route path="/orders" element={page(<OrdersPage />)} />
          <Route path="/suppliers" element={page(<SuppliersPage />)} />
          <Route path="/customers" element={page(<CustomersPage />)} />
          <Route element={<ProtectedRoute roles={['ADMIN', 'MANAGER']} />}>
            <Route path="/activity" element={page(<ActivityPage />)} />
          </Route>
          <Route element={<ProtectedRoute roles={['ADMIN']} />}>
            <Route path="/users" element={page(<UsersPage />)} />
          </Route>
          <Route path="*" element={page(<NotFoundPage />)} />
        </Route>
      </Route>
    </Routes>
  );
}
