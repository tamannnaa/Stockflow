import { api } from './axiosClient';
import type {
  ActivityEntry,
  Category,
  Customer,
  CustomerDetail,
  CustomerInput,
  DashboardSummary,
  Notification,
  Order,
  OrderDetail,
  OrderStatus,
  Paginated,
  Product,
  StockMovement,
  Supplier,
  SupplierDetail,
  User,
} from '../types';

type Params = Record<string, unknown>;

/** Drops empty values so the API's Zod query schemas only see real filters. */
const clean = (params: Params) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ user: User; accessToken: string }>('/auth/login', { email, password }),
  register: (name: string, email: string, password: string) =>
    api.post<{ user: User; accessToken: string }>('/auth/register', { name, email, password }),
  refresh: () => api.post<{ user: User; accessToken: string }>('/auth/refresh'),
  logout: () => api.post('/auth/logout'),
  me: () => api.get<{ user: User }>('/auth/me'),
};

export const productsApi = {
  list: (params: Params) => api.get<Paginated<Product>>('/products', { params: clean(params) }),
  get: (id: number) => api.get<{ data: Product }>(`/products/${id}`),
  create: (body: Params) => api.post<{ data: Product }>('/products', body),
  update: (id: number, body: Params) => api.patch<{ data: Product }>(`/products/${id}`, body),
  archive: (id: number) => api.delete(`/products/${id}`),
  adjust: (id: number, body: { changeQty: number; reason: 'ADJUSTMENT' | 'RETURN'; note?: string }) =>
    api.post<{ data: Product }>(`/products/${id}/adjust`, body),
  movements: (id: number, params: Params) =>
    api.get<Paginated<StockMovement>>(`/products/${id}/movements`, { params: clean(params) }),
  lowStock: () => api.get<{ data: Product[] }>('/products/low-stock'),
};

export const ordersApi = {
  list: (params: Params) => api.get<Paginated<Order>>('/orders', { params: clean(params) }),
  get: (id: number) => api.get<{ data: OrderDetail }>(`/orders/${id}`),
  create: (body: Params) => api.post<{ data: Order }>('/orders', body),
  updateStatus: (id: number, status: Exclude<OrderStatus, 'PENDING'>) =>
    api.patch<{ data: Order }>(`/orders/${id}/status`, { status }),
};

export const stockMovementsApi = {
  list: (params: Params) => api.get<Paginated<StockMovement>>('/stock-movements', { params: clean(params) }),
};

export const categoriesApi = {
  list: () => api.get<{ data: Category[] }>('/categories'),
  create: (body: { name: string; description?: string }) => api.post<{ data: Category }>('/categories', body),
  update: (id: number, body: { name?: string; description?: string }) =>
    api.patch<{ data: Category }>(`/categories/${id}`, body),
};

export const suppliersApi = {
  list: () => api.get<{ data: Supplier[] }>('/suppliers'),
  get: (id: number) => api.get<{ data: SupplierDetail }>(`/suppliers/${id}`),
  create: (body: Params) => api.post<{ data: Supplier }>('/suppliers', body),
  update: (id: number, body: Params) => api.patch<{ data: Supplier }>(`/suppliers/${id}`, body),
};

export const customersApi = {
  list: (params: Params) =>
    api.get<Paginated<Customer> & { walkIn: { orders: number; total: number } }>('/customers', { params: clean(params) }),
  get: (id: number) => api.get<{ data: CustomerDetail }>(`/customers/${id}`),
  create: (body: CustomerInput) => api.post<{ data: Customer }>('/customers', body),
  /** PUT replaces the record: send every field (empty = cleared). */
  update: (id: number, body: CustomerInput) => api.put<{ data: Customer }>(`/customers/${id}`, body),
  archive: (id: number) => api.post<{ data: Customer }>(`/customers/${id}/archive`),
  restore: (id: number) => api.post<{ data: Customer }>(`/customers/${id}/restore`),
  remove: (id: number) => api.delete(`/customers/${id}`),
};

export const usersApi = {
  list: () => api.get<{ data: User[] }>('/users'),
  create: (body: { name: string; email: string; password: string; role: string }) =>
    api.post<{ data: User }>('/users', body),
  update: (id: number, body: { role?: string; isActive?: boolean }) => api.patch<{ data: User }>(`/users/${id}`, body),
};

export const activityApi = {
  list: (params: Params) => api.get<Paginated<ActivityEntry>>('/activity', { params: clean(params) }),
};

export const notificationsApi = {
  list: () => api.get<{ data: Notification[]; unread: number }>('/notifications'),
  markRead: (id: number) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
};

export const dashboardApi = {
  summary: () => api.get<{ data: DashboardSummary }>('/dashboard/summary'),
};
