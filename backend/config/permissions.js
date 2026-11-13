// Role -> permission matrix for tenant (pharmacy) users.
// Permission strings use the form `module:action`. Keep this file in sync with
// frontend/src/config/permissions.js (same strings).
//
// Agents adding new modules add their permission strings here (see
// docs/AGENT_PLAN.md). `owner` automatically receives every permission listed
// in ALL_PERMISSIONS.

const MEMBERSHIP_ROLES = ['owner', 'pharmacist', 'cashier', 'storekeeper'];

const ALL_PERMISSIONS = [
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

const OWNER_ONLY = ['staff:manage', 'settings:manage', 'audit:view', 'branch:manage'];

const PERMISSIONS = {
  owner: [...ALL_PERMISSIONS],
  pharmacist: ALL_PERMISSIONS.filter((p) => !OWNER_ONLY.includes(p)),
  cashier: [
    'sales:create',
    'sales:view',
    'customer:view',
    'shift:own',
    // Needed by the POS screen (medicine search)
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

// True when `role` (a membership role) has permission `perm`.
const can = (role, perm) => Boolean(role && PERMISSION_SETS[role] && PERMISSION_SETS[role].has(perm));

module.exports = { PERMISSIONS, ALL_PERMISSIONS, MEMBERSHIP_ROLES, can };
