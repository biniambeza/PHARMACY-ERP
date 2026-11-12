# Pharmacy ERP: Recommended Changes

Findings from a review of the backend (server, middleware, models, controllers, routes, CI) and the frontend's API client, auth context and package files.

Each item lists the problem, where it is, and the suggested fix. Items are grouped by severity.

**Suggested order:** 1 → 2/3 → 4/5 → 6/7/8 → 18 → the rest.

---

## 🔴 Critical: data integrity and safety

### 1. The POS can sell expired medicine

- **Where:** `backend/controllers/salesController.js`, `createSale` (batch query, ~line 48)
- **Problem:** Batches are picked by `status: 'active'` without checking `expiryDate`. Nothing switches a batch to `expired` automatically. Because FEFO sorts by earliest expiry, out-of-date stock is sold **first**.
- **Fix:**

```js
const batches = await StockBatch.find({
  pharmacyId: req.pharmacyId,
  medicineId: medicine._id,
  status: 'active',
  quantity: { $gt: 0 },
  expiryDate: { $gt: new Date() }, // never sell expired stock
}).sort({ expiryDate: 1 });
```

Apply the same filter wherever "available stock" is calculated: the inventory summary, POS stock display and dashboard.

### 2. Failed sales leave stock deducted

- **Where:** `backend/controllers/salesController.js`, `createSale`
- **Problem:**
  - Each batch is saved while the code loops through the items. If item 2 is out of stock, or `Sale.create` fails, item 1's stock is already deducted and no sale is recorded.
  - Two cashiers selling the same item at once can oversell, because availability is checked first and saved later.
- **Fix:** Wrap the whole sale in a MongoDB transaction. Atlas supports transactions.

```js
const mongoose = require('mongoose');

const session = await mongoose.startSession();
try {
  let sale;
  await session.withTransaction(async () => {
    // ...all Medicine/StockBatch reads with .session(session)
    // ...all batch.save({ session })
    [sale] = await Sale.create([{ /* ... */ }], { session });
  });
  return res.status(201).json({ success: true, sale });
} catch (err) {
  // throw custom errors inside the transaction for 400/404 cases
} finally {
  session.endSession();
}
```

Also use an atomic, conditional decrement, so two concurrent sales can never take the same units:

```js
const updated = await StockBatch.findOneAndUpdate(
  { _id: batch._id, quantity: { $gte: take } },
  { $inc: { quantity: -take } },
  { new: true, session }
);
if (!updated) throw new Error('Stock changed, please retry');
```

### 3. Receiving purchase orders has the same problem

- **Where:** `backend/controllers/purchaseOrderController.js`, `receivePurchaseOrder`
- **Problem:**
  - A double-click or retry can receive the same order twice, adding the stock twice.
  - A missing batch number on item 3 leaves items 1 and 2 already added while the order still shows `ordered`. Receiving it again adds them twice.
  - `b.medicineId.toString()` crashes if `medicineId` is missing.
- **Fix:**
  - Validate **all** `batchDetails` before writing anything.
  - Claim the order atomically, then add stock inside a transaction:

```js
const order = await PurchaseOrder.findOneAndUpdate(
  { _id: req.params.id, pharmacyId: req.pharmacyId, status: 'ordered' },
  { status: 'received', receivedDate: new Date() },
  { new: true, session }
);
if (!order) return res.status(400).json({ success: false, message: 'Order not found or already processed' });
```

### 4. Discount, tax and payment method aren't checked

- **Where:** `backend/controllers/salesController.js`, `createSale`
- **Problem:**
  - A negative `discount` increases the total.
  - A negative `tax` fails schema validation only *after* stock was deducted (see #2).
  - Any discount up to the full subtotal is accepted.
  - An invalid `paymentMethod` also fails only at save time.
- **Fix:** Validate before touching stock:

```js
const ALLOWED_PAYMENTS = ['cash', 'card', 'mobile_money', 'credit'];
if (discount < 0 || tax < 0) return res.status(400).json({ success: false, message: 'Discount and tax must be non-negative' });
if (!ALLOWED_PAYMENTS.includes(paymentMethod)) return res.status(400).json({ success: false, message: 'Invalid payment method' });
// after computing subtotal:
if (discount > subtotal) return res.status(400).json({ success: false, message: 'Discount cannot exceed subtotal' });
```

Consider a configurable maximum discount percentage per pharmacy.

### 5. Stock-in accepts negative or zero amounts

- **Where:** `backend/controllers/stockController.js`, `addStockBatch`
- **Problem:** `quantity` is never checked to be above 0. Posting `-500` to an existing batch silently removes stock. `purchasePrice` and `expiryDate` aren't checked either.
- **Fix:**

```js
const qty = Number(quantity);
if (!Number.isInteger(qty) || qty <= 0) return res.status(400).json({ success: false, message: 'Quantity must be a positive whole number' });
const exp = new Date(expiryDate);
if (isNaN(exp) || exp <= new Date()) return res.status(400).json({ success: false, message: 'Expiry date must be a valid future date' });
```

Also check that the expiry date sent for an existing batch matches the stored one.

---

## 🔴 Security

### 6. CORS lets every website through

- **Where:** `backend/server.js`, CORS config
- **Problem:** Every branch, including the final fallback, calls `callback(null, true)`. Allowing all `*.vercel.app` sites is also too broad, since anyone can deploy one.
- **Fix:**

```js
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    if (process.env.NODE_ENV !== 'production') return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
```

Put the exact production frontend URL(s) in `CLIENT_URL`, comma-separated if there are several.

### 7. Pharmacists can rewrite any medicine field

- **Where:** `backend/controllers/medicineController.js`, `updateMedicine`
- **Problem:** `{ ...req.body }` is passed straight into the update, so any field (`_id`, `createdAt`, future fields) can be overwritten.
- **Fix:** Only allow the editable fields:

```js
const ALLOWED = ['name', 'genericName', 'category', 'dosageForm', 'strength',
  'price', 'costPrice', 'minStockLevel', 'requiresPrescription'];
const updates = Object.fromEntries(
  Object.entries(req.body).filter(([k]) => ALLOWED.includes(k))
);
Object.assign(medicine, updates);
await medicine.save();
```

### 8. Search text is used as a raw regex

- **Where:**
  - `medicineController.js`: `getMedicines` search, and the duplicate-name check in `createMedicine`
  - `supplierController.js`: search
  - `purchaseOrderController.js`: `poNumber` search
- **Problem:** A crafted pattern such as `(a+)+$` can hang the server. A medicine named `Para.*` matches the wrong records in the duplicate check.
- **Fix:** Add a shared helper and use it everywhere (`salesController.getSales` already does this):

```js
// backend/utils/escapeRegex.js
module.exports = (s = '') => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
```

For the duplicate-name check, a case-insensitive collation index is cleaner than a regex.

### 9. Login protection is weak

- **Problems and fixes:**
  - **Tokens last 30 days, are stored in `localStorage` and can't be revoked.** Shorten the lifetime to 1–12 hours. Ideally move to an `httpOnly`, `secure`, `sameSite` cookie with a refresh token. `cookie-parser` is already installed but unused.
  - **Suspended pharmacies keep access.** `/auth/me` and the admin routes don't check suspension. In `protect`, reload the user and reject suspended pharmacists, or add a `tokenVersion` field to the user and include it in the JWT.
  - **No brute-force protection.** Add `express-rate-limit` on `/auth/login`, for example 10 attempts per 15 minutes per IP.
  - **No security headers.** Add `helmet()`.
  - **Weak password rule.** Raise the minimum from 6 to at least 8–10 characters.
  - **Default admin credentials.** `seedAdmin.js` falls back to `admin@pharmacy.com` / `admin123456` and prints the password. Require `ADMIN_EMAIL` and `ADMIN_PASSWORD` to be set, and never log the password.
  - **Admin password changes.** `updatePharmacistProfile` only works for pharmacists; admins have no way to change their own password.

### 10. Internal errors are sent to users

- **Where:** every controller's `catch` block (`message: error.message`)
- **Fix:** Add one central error handler (Express 5 forwards async errors to it automatically), and remove the per-route try/catch:

```js
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || (err.name === 'ValidationError' || err.name === 'CastError' ? 400 : 500);
  res.status(status).json({
    success: false,
    message: status === 500 ? 'Internal server error' : err.message,
  });
});
```

---

## 🟠 Data model and lifecycle

### 11. Deleting a pharmacy leaves its data behind

- **Where:** `backend/controllers/adminController.js`, `deletePharmacy`
- **Problem:** Only the pharmacy and its owner user are removed. Its medicines, batches, sales, suppliers and purchase orders stay in the database with no owner.
- **Fix:** Prefer a soft delete: add `status: 'archived'` and keep the data, since pharmacy records usually have legal retention requirements. If a hard delete is really needed, delete all related collections inside a transaction.

### 12. Medicines and stock batches can be hard-deleted

- **Where:** `medicineController.deleteMedicine`, `stockController.deleteStockBatch`
- **Problem:** Records referenced by sales or purchase orders can be deleted, which breaks audit history and populated reports.
- **Fix:** Block the delete when references exist, or add an `isArchived` flag and hide archived items from the POS and catalog.

### 13. Stock changes leave no record

- **Where:** `stockController.adjustStock`, `addStockBatch`, sales, PO receive
- **Problem:** `adjustmentType` is accepted but not saved. There's no record of who changed stock, when, or why.
- **Fix:** Add a `StockMovement` model:

```js
{ pharmacyId, batchId, medicineId, type: 'sale'|'purchase'|'adjust_damaged'|'adjust_expired'|'correction'|'stock_in',
  quantityChange, balanceAfter, reason, userId, refId /* saleId or poId */, createdAt }
```

Write one entry for every stock change, inside the same transaction.

### 14. Prescription medicines aren't enforced

- **Where:** `createSale`; the POS only shows a badge
- **Fix:** If any item has `requiresPrescription`, require a `prescription` object on the sale (prescriber name, prescription number, optional image) and reject the sale without it. Save it on the `Sale`.

### 15. Invoice and PO numbers can repeat

- **Where:** `createSale`, `createPurchaseOrder`
- **Problem:** `Date.now().slice(-6)` plus a random 4-digit number can collide, and the `unique` index then fails the request after stock was deducted.
- **Fix:** Use a per-pharmacy counter collection with an atomic `$inc`, producing for example `INV-2026-000123`. That gives sequential numbering, which accountants usually expect.

---

## 🟡 Performance

### 16. Reports load everything into memory

- **Where:**
  - `salesController.getSalesSummary`: loads **all** sales to count today's sales.
  - `reportController.getDashboardOverview` / `getFinancialAnalytics`: load all sales, batches, purchase orders and suppliers on every request.
- **Problem:** Response time and memory grow with history. This will slow down within months of real use.
- **Fix:** Use aggregation pipelines with a date `$match`, and group by local day with a timezone:

```js
Sale.aggregate([
  { $match: { pharmacyId, createdAt: { $gte: from, $lt: to } } },
  { $group: {
      _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } },
      revenue: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
]);
```

Check that `x-timezone` is a valid IANA timezone name before using it.

### 17. The admin pharmacy list runs extra queries per pharmacy

- **Where:** `adminController.getPharmacies`
- **Problem:** Two `countDocuments` queries run for each pharmacy.
- **Fix:** One `Sale.aggregate([{ $group: { _id: '$pharmacyId', count: { $sum: 1 } } }])` and one similar aggregate for active batches, then merge the results in memory. Add pagination.

Also add pagination to `getStockBatches`, `getPurchaseOrders`, `getMedicines` and `getSuppliers`.

---

## 🟡 Repo and tooling

### 18. `backend/node_modules` is in git (~600 files)

```bash
git rm -r --cached backend/node_modules
echo "node_modules/" >> .gitignore
echo ".env" >> .gitignore
git commit -m "chore: stop tracking node_modules"
```

Add a root `.gitignore` covering `node_modules/`, `.env*`, `dist/` and OS files. Add `backend/.env.example` and `frontend/.env.example` listing the required variables (`MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`, `VITE_API_URL`, ...).

### 19. There are no real tests

- **Problem:** The backend `npm test` only runs `node --check server.js` (a syntax check).
- **Fix:** Add Jest or Vitest with `supertest` and `mongodb-memory-server` (replica-set mode, for transactions). Tests to write first:
  1. FEFO deducts from the earliest-expiring batch and skips expired batches.
  2. A failed multi-item sale leaves stock unchanged.
  3. Tenant isolation: pharmacist A gets 404 on pharmacy B's medicines, sales, batches and orders.
  4. A purchase order can't be received twice.
  5. Suspended pharmacies are blocked.
- Add `npm run lint` for the frontend to CI.

### 20. Smaller items

- **`nodemon ^1.14`** is very old and pulls in known-vulnerable dependencies. Upgrade it, or replace it with `node --watch server.js`.
- **Every route is mounted twice**, at `/api/x` and `/x`. Pick `/api` only.
- **`JWT_SECRET` isn't checked at startup.** Fail fast if `JWT_SECRET` or `MONGO_URI` is missing.
- **`connectDB()` isn't awaited** before `app.listen`. Start the server only after the database connects.
- **Large page components:** `Dashboard.jsx` (724 lines), `POS.jsx` (613), `Reports.jsx` (582) and `AdminDashboard.jsx` (497). Split them into smaller components and hooks.
- **The README is inaccurate.** It says "JWT (Cookie / Bearer)", but only Bearer is implemented.
- **Input validation** is scattered. Consider `zod` or `express-validator` schemas per route.
- **Logging:** add request logging (`morgan` or `pino-http`) and a `/api/health` check that includes database status.
