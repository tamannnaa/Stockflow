export type Role = 'ADMIN' | 'MANAGER' | 'STAFF';
export type OrderType = 'SALE' | 'PURCHASE';
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'FULFILLED' | 'CANCELLED';
export type MovementReason = 'SALE' | 'PURCHASE' | 'ADJUSTMENT' | 'RETURN';
export type StockFilter = 'in' | 'low' | 'out';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

export interface Category {
  id: number;
  name: string;
  description?: string | null;
  _count?: { products: number };
}

export interface Supplier {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  createdAt: string;
  _count?: { products: number; orders: number };
}

export interface SupplierDetail extends Supplier {
  products: { id: number; sku: string; name: string; quantityInStock: number; reorderLevel: number; costPrice: string }[];
  orders: { id: number; orderNumber: string; status: OrderStatus; totalAmount: string; createdAt: string }[];
}

/** Money fields are Prisma Decimals, serialised as strings. */
export interface Product {
  id: number;
  sku: string;
  name: string;
  description?: string | null;
  unitPrice: string;
  costPrice: string;
  quantityInStock: number;
  reorderLevel: number;
  isActive?: boolean;
  categoryId?: number | null;
  supplierId?: number | null;
  createdAt?: string;
  updatedAt?: string;
  category?: { id: number; name: string } | null;
  supplier?: { id: number; name: string } | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: Pagination;
}

export interface Order {
  id: number;
  orderNumber: string;
  type: OrderType;
  status: OrderStatus;
  totalAmount: string;
  /** Name snapshot taken when the order was placed. */
  customerName?: string | null;
  customerId?: number | null;
  supplierId?: number | null;
  createdAt: string;
  createdBy?: { id: number; name: string };
  supplier?: { id: number; name: string } | null;
  customer?: { id: number; name: string; companyName?: string | null; email?: string | null; phone?: string | null; isActive?: boolean } | null;
  _count?: { items: number };
}

export interface StockMovement {
  id: number;
  productId: number;
  changeQty: number;
  reason: MovementReason;
  referenceOrderId?: number | null;
  createdAt: string;
  product?: { id: number; sku: string; name: string };
  createdBy?: { id: number; name: string };
  order?: { id: number; orderNumber: string; type: OrderType } | null;
}

export interface OrderDetail extends Order {
  items: {
    id: number;
    productId: number;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
    product: { id: number; sku: string; name: string };
  }[];
  supplier?: Supplier | null;
  movements: StockMovement[];
}

export interface Notification {
  id: number;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface ActivityEntry {
  id: number;
  action: string;
  entity?: string | null;
  entityId?: number | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  user?: { id: number; name: string; email: string; role: Role } | null;
}

/** Stats count non-cancelled SALE orders only. Money values are rounded numbers. */
export interface CustomerStats {
  orders: number;
  totalSpent: number;
  avgOrderValue: number;
  lastOrderAt: string | null;
  firstOrderAt: string | null;
  unitsPurchased: number;
}

export interface Customer {
  id: number;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  gstin: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  stats: CustomerStats;
  /** All linked orders including cancelled — 0 means the customer can be deleted. */
  orderCount: number;
}

export interface CustomerDetail extends Customer {
  orders: {
    id: number;
    orderNumber: string;
    type: OrderType;
    status: OrderStatus;
    totalAmount: string;
    customerName: string | null;
    createdAt: string;
    _count: { items: number };
  }[];
}

export interface CustomerInput {
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  gstin?: string;
}

export interface PeriodValue {
  current: number;
  previous: number;
}

export interface DashboardSummary {
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  stockValue: number;
  retailValue: number;
  totalUnits: number;
  salesOrders: number;
  salesRevenue: number;
  period: {
    days: number;
    salesRevenue: PeriodValue;
    salesOrders: PeriodValue;
    purchaseSpend: PeriodValue;
    purchaseOrders: PeriodValue;
  };
  topProducts: { id: number; name: string; sku: string; unitsSold: number; revenue: number }[];
  salesTrend: { day: string; revenue: number }[];
  dailySeries: { day: string; sales: number; purchases: number; orders: number }[];
  stockByCategory: { category: string; products: number; units: number; value: number }[];
  statusBreakdown: { type: OrderType; status: OrderStatus; count: number }[];
  lowStockItems: {
    id: number;
    sku: string;
    name: string;
    quantityInStock: number;
    reorderLevel: number;
    supplierId: number | null;
    supplierName: string | null;
  }[];
  recentOrders: Order[];
}
