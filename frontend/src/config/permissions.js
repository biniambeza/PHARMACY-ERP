// Mirror of backend/config/permissions.js (same strings). Keep both in sync.
// The backend is the source of truth; this only hides UI the role can't use.

export const MEMBERSHIP_ROLES = ['owner', 'pharmacist', 'cashier', 'storekeeper'];

export const ROLE_LABELS = {
  owner: 'Owner',
  pharmacist: 'Pharmacist',
  cashier: 'Cashier',
  storekeeper: 'Storekeeper',
};

export const ALL_PERMISSIONS = [
  // Dashboard
  'dashboard:view',
  // Sales
  'sales:create',
  'sales:view',
  'sales:return',
  'sales:void',
  'credit:sell',
  'shift:own',
  'shift:manage',
  // Catalog
  'medicine:view',
  'medicine:manage',
  'price:manage',
  // Inventory
  'stock:view',
  'stock:in',
  'stock:adjust',
  'stock:take',
  'transfer:manage',
  'data:import',
  // Procurement
  'po:view',
  'po:manage',
  'po:receive',
  'supplier:view',
  'supplier:manage',
  'supplier:pay',
  // Customers
  'customer:view',
  'customer:manage',
  // Clinical
  'patient:view',
  'patient:manage',
  'prescription:manage',
  'controlled:view',
  'controlled:dispense',
  'interaction:manage',
  // Admin / insights
  'reports:view',
  'data:export',
  'audit:view',
  'settings:manage',
  'staff:manage',
  'branch:manage',
  'notifications:view',
];

const OWNER_ONLY = ['staff:manage', 'settings:manage', 'audit:view', 'branch:manage', 'sales:void'];

export const PERMISSIONS = {
  owner: [...ALL_PERMISSIONS],
  pharmacist: ALL_PERMISSIONS.filter((p) => !OWNER_ONLY.includes(p)),
  cashier: [
    'sales:create',
    'sales:view',
    'customer:view',
    // Patient lookup at the POS (view only)
    'patient:view',
    'shift:own',
    'medicine:view',
    'notifications:view',
  ],
  storekeeper: [
    'dashboard:view',
    'medicine:view',
    'stock:view',
    'stock:in',
    'stock:adjust',
    'stock:take',
    'transfer:manage',
    'po:view',
    'po:manage',
    'po:receive',
    'supplier:view',
    'notifications:view',
  ],
};

const PERMISSION_SETS = Object.fromEntries(
  Object.entries(PERMISSIONS).map(([role, perms]) => [role, new Set(perms)])
);

export const roleCan = (role, perm) => Boolean(role && PERMISSION_SETS[role]?.has(perm));
