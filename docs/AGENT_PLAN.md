# Feature Build Plan (multi-agent)

Source of truth for *what* to build: `FEATURES.md` (30 features). This file defines **who owns which files** and the **contracts between modules**, so agents working in parallel in the same working tree don't collide.

## Ground rules (all agents)

- Branch `feature/erp-upgrade`. **Never commit, push, reset, stash or checkout.** The orchestrator commits.
- **Edit only files you own** (listed below) plus NEW files you create inside your own module. If you need a change in someone else's file, write it under "Requests for other owners" in your final report instead.
- **Don't run `npm install`.** These packages are already installed:
  - backend: node-cron, nodemailer, exceljs, helmet, express-rate-limit, jest, supertest, mongodb-memory-server
  - frontend: react-i18next, i18next, jsbarcode, jspdf, jspdf-autotable, idb, vite-plugin-pwa (dev)
- **Backend conventions:**
  - Express 5 + Mongoose 9 (CommonJS).
  - Throw `AppError(msg, status)` from `backend/utils/AppError.js`; the central handler is in `middleware/errorHandler.js`. Never send `error.message` in a 500.
  - Use transactions (`session.withTransaction`) for multi-document writes.
  - Every stock change goes through `recordMovement()` in `utils/stockMovement.js`.
  - Escape user input with `utils/escapeRegex.js`.
  - Use `utils/sequence.js` for document numbers.
  - Every query is scoped by `req.pharmacyId`.
  - Call `audit(req, {...})` from `utils/audit.js` for sensitive actions.
- **Frontend conventions:**
  - React 19, Tailwind v4, lucide-react icons, light/dark theme. Copy the existing page styling (look at `Medicines.jsx` / `Suppliers.jsx`).
  - API modules live in `frontend/src/api/*Api.js` and use the `api` axios instance.
  - Show money with `formatMoney()` from `frontend/src/utils/format.js`.
- **Tests:** add Jest tests for your backend module in `backend/tests/<module>.test.js`, using the helpers in `tests/helpers.js`. Don't edit `helpers.js`; add your own helpers inside your test file. Run `npx jest tests/<yours>` from `backend/`.
- **Before you finish:**
  - `node --check` on changed backend files.
  - `npx eslint <your files>` from `frontend/` (must have 0 errors).
  - Run your tests.
- **Final report:** files changed, endpoints added, UI added, tests and their results, requests for other owners, and anything not done.

## Waves

| Wave | Agents | Notes |
|---|---|---|
| 1 | Foundation (1 agent) | Must finish before Wave 2 |
| 2 | Returns, Notify, Finance, Procurement, Catalog, Clinical, Insights, Admin/Branches, Platform (9 agents, parallel) | |
| 3 | POS & Shifts (1 agent) | Integrates the Wave 2 services into the POS and sales |
| 4 | i18n string extraction + splitting large components | Orchestrator runs the full test suite and build |

## Core data model (built by Foundation)

### Staff, roles and branches (#1, #23)

- `User.role` stays `'admin' | 'pharmacist'`. `'pharmacist'` now means "a tenant user" (any staff member).
- `User.memberships: [{ pharmacyId, role: 'owner'|'pharmacist'|'cashier'|'storekeeper', active: Boolean }]`.
- `User.organizationId` (optional) groups branches.
- `Organization { name, ownerId }`. `Pharmacy.organizationId` = branch of an organization.
- **Older data:** if a user has no memberships but is `Pharmacy.owner`, they are treated as `owner` of that pharmacy (migrated when they next sign in).
- **Branch choice:** the active branch is chosen by the `x-pharmacy-id` header and validated against memberships. Without the header, the first active membership is used.
- `pharmacyScope` sets `req.pharmacy`, `req.pharmacyId` and `req.membershipRole`.
- **Permissions:** `backend/config/permissions.js` exports `PERMISSIONS` (role → list of permission strings) and the `can(role, perm)` function. Middleware `requirePermission(...perms)` lives in `middleware/permission.js`. Use permission strings in the form `module:action`, for example `sales:create`, `sales:return`, `sales:void`, `stock:adjust`, `stock:take`, `po:manage`, `po:receive`, `medicine:manage`, `price:manage`, `customer:manage`, `credit:sell`, `supplier:pay`, `reports:view`, `audit:view`, `settings:manage`, `staff:manage`, `controlled:dispense`, `shift:manage`, `transfer:manage`.
  - `owner` has all permissions.
  - `pharmacist`: everything except `staff:manage`, `settings:manage` and `audit:view`.
  - `cashier`: `sales:create`, `sales:view`, `customer:view`, `shift:own`, `medicine:view`, `notifications:view`.
  - `storekeeper`: `dashboard:view`, `medicine:view`, `stock:view|in|adjust|take`, `transfer:manage`, `po:view|manage|receive`, `supplier:view`, `notifications:view`.
  - The final list of strings is in the "Foundation implementation notes" section at the end of this file.
  - Agents adding new modules **add their permission strings** to the matrix. This file is owned by Foundation; after Wave 1, put changes under "Requests for other owners" and the orchestrator merges them.
- **Frontend:** `AuthContext` exposes `membershipRole`, `can(perm)`, `pharmacies` (branches) and `activePharmacyId`/`switchPharmacy(id)`. Axios sends `x-pharmacy-id`. A `<Can perm="...">` component hides UI the role isn't allowed to use. The sidebar hides links the role can't use.

### Shared model fields (added by Foundation so later agents don't touch the shared models)

- **Medicine:**
  - Catalog: `barcode` (sparse unique per pharmacy), `sku`.
  - Purchasing: `preferredSupplierId`, `leadTimeDays` (default 7), `reorderSafetyDays` (default 7).
  - Pack units: `baseUnit` (default 'unit'), `packUnits: [{ name, factor, price, barcode }]`.
  - Flags: `taxExempt` (false), `isControlled` (false), `controlledSchedule` (''), `minMarginPercent` (null), `isArchived` (exists).
- **Sale:**
  - People and records: `staffId` (= user who sold; keep `pharmacistId` for compatibility), `shiftId`, `customerId`, `patientId`, `prescriptionId`.
  - Tax: `taxLines: [{ name, rate, amount }]`.
  - Payment: `payments: [{ method, amount, reference, provider, status }]` (split payments; `paymentMethod` stays as the main method), `amountPaid`, `balanceDue`.
  - Returns and voids: `returnStatus: 'none'|'partial'|'full'`, `voided` (Boolean), `voidReason`, `voidedBy`, `voidedAt`.
  - Sync: `offlineId` (sparse unique per pharmacy, used for offline sync de-duplication).
  - Items: `items[].unitName`, `items[].unitFactor`, `items[].taxAmount`, `items[].costPrice` (batch purchase price at the time of sale, for profit reports).
- **Pharmacy:**
  - Tax: `settings.tax: { enabled, name: 'VAT', rate: 15, inclusive: false, registrationNo }`.
  - Locale and money: `settings.currency` ('ETB'), `settings.locale` ('en').
  - Receipts: `settings.receiptFooter`, `settings.receiptWidth` ('80mm').
  - Alerts: `settings.expiryAlertDays: [30, 60, 90]`, `settings.notify: { email, sms, dailySummary }`.
  - POS: `settings.maxDiscountPercent`.
  - Platform: `subscription: { plan, status: 'trial'|'active'|'past_due'|'cancelled', currentPeriodEnd }`, `organizationId`.
- **StockMovement types** add: `return`, `void`, `transfer_out`, `transfer_in`, `stock_take`, `expire`, `unit_conversion`.
- **AuditLog model + `utils/audit.js`:** `audit(req, { action, entity, entityId, before, after, meta })`. It fills in user, pharmacy, ip and user agent, never throws, and accepts `{ session }`.

### Scaffolding (built by Foundation)

- **Backend:** `backend/app.js` mounts these routers. Foundation creates each file as an empty `express.Router()` with `protect` + `pharmacyScope` applied (admin routers use `authorize('admin')`):

  | Mount | Router file | Owner |
  |---|---|---|
  | `/api/staff` | `routes/staffRoutes.js` | Foundation |
  | `/api/branches` | `routes/branchRoutes.js` | Foundation |
  | `/api/returns` | `routes/returnRoutes.js` | Returns |
  | `/api/notifications` | `routes/notificationRoutes.js` | Notify |
  | `/api/customers` | `routes/customerRoutes.js` | Finance |
  | `/api/payables` | `routes/payableRoutes.js` | Finance |
  | `/api/reorder` | `routes/reorderRoutes.js` | Procurement |
  | `/api/stock-takes` | `routes/stockTakeRoutes.js` | Catalog |
  | `/api/movements` | `routes/movementRoutes.js` | Catalog |
  | `/api/import` | `routes/importRoutes.js` | Catalog |
  | `/api/patients` | `routes/patientRoutes.js` | Clinical |
  | `/api/prescriptions` | `routes/prescriptionRoutes.js` | Clinical |
  | `/api/controlled` | `routes/controlledRoutes.js` | Clinical |
  | `/api/interactions` | `routes/interactionRoutes.js` | Clinical |
  | `/api/audit` | `routes/auditRoutes.js` | Insights |
  | `/api/export` | `routes/exportRoutes.js` | Insights |
  | `/api/transfers` | `routes/transferRoutes.js` | Admin/Branches |
  | `/api/admin/platform` | `routes/platformAdminRoutes.js` | Admin/Branches |
  | `/api/announcements` | `routes/announcementRoutes.js` | Admin/Branches |
  | `/api/shifts` | `routes/shiftRoutes.js` | POS |
  | `/api/payments` | `routes/paymentRoutes.js` | POS |

- **Frontend:** `App.jsx` has routes for every new page, each pointing to a placeholder component file that the owner replaces. `PharmacyLayout.jsx` has the matching sidebar entries (grouped and permission-gated) and renders `<NotificationBell />` from `components/layout/NotificationBell.jsx` (a placeholder owned by Notify) and `<BranchSwitcher />` (owned by Foundation).

  | Path | Page file | Owner |
  |---|---|---|
  | `/pharmacy/staff` | `pages/pharmacist/Staff.jsx` | Foundation |
  | `/pharmacy/returns` | `pages/pharmacist/Returns.jsx` | Returns |
  | `/pharmacy/expiry` | `pages/pharmacist/Expiry.jsx` | Notify |
  | `/pharmacy/notifications` | `pages/pharmacist/Notifications.jsx` | Notify |
  | `/pharmacy/customers` | `pages/pharmacist/Customers.jsx` | Finance |
  | `/pharmacy/payables` | `pages/pharmacist/Payables.jsx` | Finance |
  | `/pharmacy/reorder` | `pages/pharmacist/Reorder.jsx` | Procurement |
  | `/pharmacy/stock-take` | `pages/pharmacist/StockTake.jsx` | Catalog |
  | `/pharmacy/movements` | `pages/pharmacist/Movements.jsx` | Catalog |
  | `/pharmacy/import` | `pages/pharmacist/Import.jsx` | Catalog |
  | `/pharmacy/patients` | `pages/pharmacist/Patients.jsx` | Clinical |
  | `/pharmacy/controlled` | `pages/pharmacist/ControlledRegister.jsx` | Clinical |
  | `/pharmacy/interactions` | `pages/pharmacist/Interactions.jsx` | Clinical |
  | `/pharmacy/audit` | `pages/pharmacist/AuditLog.jsx` | Insights |
  | `/pharmacy/transfers` | `pages/pharmacist/Transfers.jsx` | Admin/Branches |
  | `/pharmacy/shifts` | `pages/pharmacist/Shifts.jsx` | POS |
  | `/forgot-password` | `pages/auth/ForgotPassword.jsx` | Notify |
  | `/reset-password` | `pages/auth/ResetPassword.jsx` | Notify |

- `frontend/src/utils/format.js` exports `formatMoney(amount, currency?)` and `formatDate`. Foundation writes a simple version; Platform makes it locale and currency aware.

## Wave 2 ownership

| Agent | Features | Owns (besides its new module files) |
|---|---|---|
| **Returns** | #2 returns, refunds, voids | `SalesHistory.jsx`, `returnController.js`, `models/Return.js` |
| **Notify** | #4 expiry job, #5 notifications, #8 password reset | `authController.js`, `authRoutes.js`, `Login.jsx`, `jobs/**`, `services/notify.js`, `models/Notification.js`, `NotificationBell.jsx` |
| **Finance** | #6 credit customers, #10 supplier payments | `Suppliers.jsx`, `SupplierModal.jsx`, `supplierController.js`, `models/Supplier.js`, new Customer/CustomerPayment/SupplierInvoice/SupplierPayment models, `services/credit.js` |
| **Procurement** | #9 partial receiving, #12 reorder | `purchaseOrderController.js`, `models/PurchaseOrder.js`, `PurchaseOrders.jsx`, `CreatePOModal.jsx`, `ReceivePOModal.jsx` |
| **Catalog** | #3 barcode (catalog + labels), #11 stock take, #13 pack units (catalog side), #14 price mgmt, #15 movements UI, #28 import | `medicineController.js`, `stockController.js`, `models/Medicine.js` (after Foundation), `Medicines.jsx`, `MedicineModal.jsx`, `Stock.jsx`, `StockInModal.jsx`, `StockAdjustModal.jsx`, `models/PriceHistory.js`, `models/StockTake.js` |
| **Clinical** | #16 patients and prescriptions, #17 controlled register, #18 interactions and allergies | Patient/Prescription/ControlledEntry/InteractionRule models, `services/clinical.js` |
| **Insights** | #19 audit log UI, #20 export and print, #21 reports, #22 tax config | `reportController.js`, `pharmacyController.js`, `Reports.jsx`, `Dashboard.jsx`, `Settings.jsx`, `InvoiceReceiptModal.jsx`, `services/tax.js`, `frontend/src/utils/export.js` |
| **Admin/Branches** | #23 transfers and consolidated reports, #24 subscriptions, announcements, support mode | `adminController.js`, `adminRoutes.js`, `pages/admin/**`, `models/Transfer.js`, `models/Announcement.js` |
| **Platform** | #25 i18n infrastructure and currency, #28 backups, #30 lazy routes and code splitting | `frontend/src/i18n/**`, `frontend/src/utils/format.js` (after Foundation), `App.jsx` (lazy imports only), `vite.config.js`, `main.jsx`, `backend/scripts/**` |

## Wave 2 → Wave 3 service contracts

The POS agent will call these. Implement them with exactly these signatures.

- `services/credit.js` (Finance):
  - `assertCreditAllowed({ pharmacyId, customerId, amount }, { session })` throws `AppError` if the customer is missing, inactive or over their limit.
  - `applyCreditSale({ pharmacyId, customerId, saleId, amount }, { session })` increases the customer's balance.
- `services/tax.js` (Insights): `computeTax({ pharmacy, lines: [{ medicine, lineTotal }] })` returns `{ taxLines, taxTotal, lineTaxes: number[] }`. It respects `taxExempt`, inclusive or exclusive pricing, and the enabled flag.
- `services/clinical.js` (Clinical):
  - `checkSaleClinical({ pharmacyId, patientId, medicineIds })` returns `{ interactions: [...], allergyHits: [...] }`.
  - `recordControlledDispenses({ pharmacyId, sale, patientId, prescriptionId, userId }, { session })` writes register entries for controlled medicines. It throws `AppError` if a controlled medicine is sold without a prescription and patient.
- `services/notify.js` (Notify):
  - `createNotification({ pharmacyId, type, title, message, link, severity, userIds? })`
  - `sendEmail({ to, subject, text, html })` and `sendSms({ to, text })`. Both are no-op loggers unless SMTP or SMS env vars are set.
- **Returns (Returns agent):** returns use the `Return` model and `RET` sequence and put stock back into `items[].batchId`. They reverse credit balances through `services/credit.js` `reverseCredit({ pharmacyId, customerId, amount, refId }, { session })`, which Finance provides as well.

## Foundation implementation notes (Wave 1 result)

These describe what Foundation actually built, including deviations from the sections above. Where they differ, these notes win.

### Permissions

- Final strings (`backend/config/permissions.js`, mirrored in `frontend/src/config/permissions.js`):
  `dashboard:view`, `sales:create`, `sales:view`, `sales:return`, `sales:void`, `credit:sell`, `shift:own`, `shift:manage`,
  `medicine:view`, `medicine:manage`, `price:manage`, `stock:view`, `stock:in`, `stock:adjust`, `stock:take`, `transfer:manage`, `data:import`,
  `po:view`, `po:manage`, `po:receive`, `supplier:view`, `supplier:manage`, `supplier:pay`, `customer:view`, `customer:manage`,
  `patient:view`, `patient:manage`, `prescription:manage`, `controlled:view`, `controlled:dispense`, `interaction:manage`,
  `reports:view`, `data:export`, `audit:view`, `settings:manage`, `staff:manage`, `branch:manage`, `notifications:view`.
- Owner-only: `staff:manage`, `settings:manage`, `audit:view`, `branch:manage`. `pharmacist` has everything else.
- `backend/config/permissions.js` exports `PERMISSIONS`, `ALL_PERMISSIONS`, `MEMBERSHIP_ROLES` and `can(role, perm)`. New strings go into `ALL_PERMISSIONS` (the owner gets them automatically) and into the role lists as needed, in **both** the backend and the frontend file.
- `middleware/permission.js` exports `requirePermission(...perms)` (all are required) and `requireAnyPermission(...perms)` (any one is enough). Both let platform admins (`req.user.role === 'admin'`) through. Tenant routers still use `authorize('pharmacist')` to keep admins out where needed.
- A 403 body looks like `{ success: false, code: 'FORBIDDEN', message, missing: [...] }`.
- How the existing routes are mapped:
  - Medicines: GET needs `medicine:view`; writes need `medicine:manage`.
  - Stock: `GET /` needs `stock:view` **or** `sales:create` (the POS needs FEFO batches); `/summary` needs `stock:view`; POST needs `stock:in`; adjust and delete need `stock:adjust`.
  - Sales: POST needs `sales:create`; GETs need `sales:view`.
  - Suppliers: GET needs `supplier:view`; writes need `supplier:manage`.
  - Purchase orders: GET needs `po:view`; create and cancel need `po:manage`; receive needs `po:receive`.
  - Reports: `/analytics` needs `reports:view`; `/overview` needs `dashboard:view`.
  - Pharmacy: `GET /api/pharmacy/my-pharmacy` and `PUT /api/pharmacy/profile` are open to any staff member; `PUT /api/pharmacy/my-pharmacy` needs `settings:manage`.

### Memberships, branches and auth

- `User.memberships: [{ pharmacyId, role, active }]` (no `_id`), `User.organizationId` and `User.MEMBERSHIP_ROLES`. `models/Organization.js` is `{ name, ownerId }`.
- **`Pharmacy.owner` is no longer unique**, because an owner can own several branches. At startup `server.js` now runs `syncIndexes()` for Pharmacy and Medicine. This drops the old `owner_1` unique index and builds the new barcode index.
- `utils/membership.js` exports:
  - `ensureMemberships(user)`: lazy legacy migration, persisted.
  - `activeMemberships`, `findMembership`, `describeMemberships(user, pharmacies?)`, `pharmacyBlockedResponse` and `sameId`.
- `protect`:
  - Migrates legacy owners.
  - Rejects users whose memberships are all inactive (403 `ACCOUNT_DEACTIVATED`).
  - Rejects users whose pharmacies are all suspended or archived (403 `PHARMACY_SUSPENDED` / `PHARMACY_ARCHIVED`).
  - Sets `req.userPharmacies` (the Pharmacy docs of the active memberships).
- `pharmacyScope` for tenant users:
  - `x-pharmacy-id` must be a valid ObjectId (otherwise 400) of an active membership (otherwise 403 `NO_BRANCH_ACCESS`).
  - The selected pharmacy must be active (otherwise 403 `PHARMACY_*`).
  - Sets `req.pharmacy` (Mongoose doc), `req.pharmacyId` (ObjectId) and `req.membershipRole`.
  - Admin behaviour is unchanged.
- `POST /api/auth/login` and `GET /api/auth/me` return `memberships: [{ pharmacyId, role, active, pharmacy: { _id, name, status, organizationId, address, phone } }]` next to `user`.
- Staff API (all routes need `staff:manage`):
  - `GET /api/staff` and `GET /api/staff/:userId`.
  - `POST /api/staff {name, email, password, role}`. An existing email is accepted only for a user of the same organization, who then gets a membership.
  - `PATCH /api/staff/:userId/role {role}`.
  - `PATCH /api/staff/:userId/deactivate` (bumps `tokenVersion`) and `PATCH /api/staff/:userId/reactivate`.
  - The last active owner can't be demoted or deactivated.
  - Every change is audited (`staff.create|add|role_change|deactivate|reactivate`).
- Branch API:
  - `GET /api/branches` (any staff) returns `{ activePharmacyId, organizationId, branches }`.
  - `POST /api/branches {name, address, phone, licenseNo}` (needs `branch:manage`) creates the Organization if missing, the Pharmacy (copying the current settings) and an owner membership. It is audited as `branch.create`.
- Admin `createPharmacy` also creates an Organization and the owner membership. Archiving a pharmacy now revokes the tokens of the owner and of every member of that pharmacy.
- `salesController.createSale` now also sets `staffId` (same value as `pharmacistId`).

### Shared models

- Signature: `audit(req, { action, entity, entityId, before, after, meta, pharmacyId?, userId? }, { session }?)`.
  - The session goes in the **third** argument.
  - `req` may be `null` for jobs.
  - Mongoose docs are converted to plain objects, with `password` and `tokenVersion` removed.
  - `AuditLog` also stores `userName` and `userRole`.
- Medicine `barcode` and Sale `offlineId`: a setter stores empty strings as unset, and the unique indexes use `partialFilterExpression: { <field>: { $type: 'string' } }`.
- Medicine pack units: `packUnits: [{ name, factor (>= 1), price, barcode }]`.
- Sale items: `unitName` (default 'unit'), `unitFactor` (default 1), `taxAmount` (default 0), `costPrice` (no default).
- Sale: `amountPaid` has no default and `balanceDue` defaults to 0. `payments[].status` is one of `pending|completed|failed|refunded` (default `completed`).
- Pharmacy defaults:
  - `settings`: tax disabled, VAT at 15% exclusive, currency `ETB`, locale `en`, `receiptWidth` one of `58mm|80mm|A4`, and `maxDiscountPercent` 100 (no limit).
  - `subscription`: `{ plan: 'standard', status: 'active', currentPeriodEnd: null }`.

### Frontend

- `AuthContext` exposes:
  - `memberships`, `pharmacies` (usable branches), `activePharmacyId`, `activePharmacy`, `membershipRole` and `can(perm)`.
  - `switchPharmacy(id)`: stores `localStorage.activePharmacyId` and reloads `/pharmacy`.
  - `updateSession({ token, user, memberships })`.
- `api/axios.js` exports `ACTIVE_PHARMACY_KEY` and sends `x-pharmacy-id`. If a selected branch gets a 403 `NO_BRANCH_ACCESS` or `PHARMACY_*`, it forgets that branch and reloads.
- Sidebar items and quick actions live in **`frontend/src/config/navigation.js`** (`navGroups`, `quickActions`, `landingPath(can)`), each with a `perm`.
- Routes live in the `pharmacyPages` array in `App.jsx`. Each one is wrapped by `routes/PermissionRoute.jsx`, which redirects to the first page the role may open (for example, cashiers land on the POS).
- `navigation.js` and the `pharmacyPages` array are owned by Foundation: request changes through the orchestrator.
- Shared components:
  - `components/common/Can.jsx`: `<Can perm="x" any fallback>`.
  - `components/common/ComingSoon.jsx`: used by the placeholder pages.
  - `components/layout/BranchSwitcher.jsx`.
  - `components/layout/NotificationBell.jsx`: a placeholder owned by Notify.
- The Settings link is shown to every role, because it holds the personal profile and password form. Insights should hide the pharmacy-settings section unless `can('settings:manage')`.
- `utils/format.js` exports `formatMoney(amount, currency='ETB')`, `formatDate(d, options?)` and `formatDateTime(d)`.
- API modules: `api/staffApi.js` and `api/branchApi.js`. The Staff page also has a "New Branch" dialog (needs `branch:manage`).
- The scaffolded backend routers already import `requirePermission`, with an eslint-disable comment for the unused import. Remove the comment when you use it.
- `routes/paymentRoutes.js` applies `protect` to every route. A public payment-provider webhook therefore needs its own router, or must be mounted before `router.use(...)`.
