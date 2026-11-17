import {
  ArrowLeftRight,
  Building2,
  LayoutDashboard,
  LucideIcon,
  Package,
  ScrollText,
  ShoppingCart,
  Tags,
  Truck,
  UserCog,
  Users,
} from 'lucide-react';
import type { Role } from '../../types';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Match on pathname + this search string (e.g. "type=SALE"). */
  search?: string;
  roles?: Role[];
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  { label: 'Overview', items: [{ label: 'Dashboard', to: '/', icon: LayoutDashboard }] },
  {
    label: 'Inventory',
    items: [
      { label: 'Products', to: '/products', icon: Package },
      { label: 'Stock movements', to: '/stock-movements', icon: ArrowLeftRight },
      { label: 'Categories', to: '/categories', icon: Tags },
    ],
  },
  {
    label: 'Orders',
    items: [
      { label: 'Sales orders', to: '/orders', search: 'type=SALE', icon: ShoppingCart },
      { label: 'Purchase orders', to: '/orders', search: 'type=PURCHASE', icon: Truck },
    ],
  },
  {
    label: 'Partners',
    items: [
      { label: 'Suppliers', to: '/suppliers', icon: Building2 },
      { label: 'Customers', to: '/customers', icon: Users },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Team', to: '/users', icon: UserCog, roles: ['ADMIN'] },
      { label: 'Audit log', to: '/activity', icon: ScrollText, roles: ['ADMIN', 'MANAGER'] },
    ],
  },
];

/** Title shown in the top bar for the current route. */
export function titleFor(pathname: string, search: string): string {
  if (pathname === '/orders') {
    if (search.includes('type=SALE')) return 'Sales orders';
    if (search.includes('type=PURCHASE')) return 'Purchase orders';
    return 'Orders';
  }
  for (const s of NAV) for (const i of s.items) if (i.to === pathname) return i.label;
  return 'Stockflow';
}
