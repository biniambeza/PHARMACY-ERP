// Sidebar navigation for the pharmacy portal. Each item is shown only when the
// active membership role has `perm` (null = every staff member).
import {
  Home,
  Receipt,
  TrendingUp,
  Undo2,
  Clock,
  Users,
  Pill,
  Boxes,
  ClipboardCheck,
  ArrowLeftRight,
  CalendarClock,
  Truck,
  Upload,
  Building2,
  ShoppingCart,
  RefreshCcw,
  Wallet,
  HeartPulse,
  ShieldAlert,
  Activity,
  BarChart3,
  ScrollText,
  UserCog,
  Settings,
} from 'lucide-react';

export const navGroups = [
  {
    label: null,
    items: [{ name: 'Overview', to: '/pharmacy', end: true, icon: Home, perm: 'dashboard:view' }],
  },
  {
    label: 'Sales',
    items: [
      { name: 'Point of Sale', to: '/pharmacy/pos', icon: Receipt, badge: 'POS', perm: 'sales:create' },
      { name: 'Sales History', to: '/pharmacy/sales', icon: TrendingUp, perm: 'sales:view' },
      { name: 'Returns', to: '/pharmacy/returns', icon: Undo2, perm: 'sales:return' },
      { name: 'Shifts', to: '/pharmacy/shifts', icon: Clock, perm: 'shift:own' },
      { name: 'Customers', to: '/pharmacy/customers', icon: Users, perm: 'customer:view' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { name: 'Medicines', to: '/pharmacy/medicines', icon: Pill, perm: 'medicine:view' },
      { name: 'Stock', to: '/pharmacy/stock', icon: Boxes, badge: 'FEFO', perm: 'stock:view' },
      { name: 'Stock Take', to: '/pharmacy/stock-take', icon: ClipboardCheck, perm: 'stock:take' },
      { name: 'Movements', to: '/pharmacy/movements', icon: ArrowLeftRight, perm: 'stock:view' },
      { name: 'Expiry', to: '/pharmacy/expiry', icon: CalendarClock, perm: 'stock:view' },
      { name: 'Transfers', to: '/pharmacy/transfers', icon: Truck, perm: 'transfer:manage' },
      { name: 'Import', to: '/pharmacy/import', icon: Upload, perm: 'data:import' },
    ],
  },
  {
    label: 'Procurement',
    items: [
      { name: 'Suppliers', to: '/pharmacy/suppliers', icon: Building2, perm: 'supplier:view' },
      { name: 'Purchase Orders', to: '/pharmacy/procurement', icon: ShoppingCart, perm: 'po:view' },
      { name: 'Reorder', to: '/pharmacy/reorder', icon: RefreshCcw, perm: 'po:manage' },
      { name: 'Payables', to: '/pharmacy/payables', icon: Wallet, perm: 'supplier:pay' },
    ],
  },
  {
    label: 'Clinical',
    items: [
      { name: 'Patients', to: '/pharmacy/patients', icon: HeartPulse, perm: 'patient:view' },
      { name: 'Controlled Register', to: '/pharmacy/controlled', icon: ShieldAlert, perm: 'controlled:view' },
      { name: 'Interactions', to: '/pharmacy/interactions', icon: Activity, perm: 'interaction:manage' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { name: 'Reports', to: '/pharmacy/reports', icon: BarChart3, perm: 'reports:view' },
      { name: 'Audit Log', to: '/pharmacy/audit', icon: ScrollText, perm: 'audit:view' },
      { name: 'Staff', to: '/pharmacy/staff', icon: UserCog, perm: 'staff:manage' },
      // Visible to everyone: holds the personal profile / password form
      { name: 'Settings', to: '/pharmacy/settings', icon: Settings, perm: null },
    ],
  },
];

export const quickActions = [
  { name: 'Create Purchase', to: '/pharmacy/procurement', icon: ShoppingCart, perm: 'po:manage' },
  { name: 'New Sale (POS)', to: '/pharmacy/pos', icon: Receipt, perm: 'sales:create' },
  { name: 'Record Stock', to: '/pharmacy/stock', icon: Boxes, perm: 'stock:in' },
  { name: 'Add Supplier', to: '/pharmacy/suppliers', icon: Building2, perm: 'supplier:manage' },
];

// First page the current role may open (used when a page is not allowed).
export const landingPath = (can) => {
  for (const group of navGroups) {
    const item = group.items.find((i) => !i.perm || can(i.perm));
    if (item && item.perm) return item.to;
  }
  return '/pharmacy/settings';
};
