# Pharmacy ERP: Recommended Features

This list covers features the system doesn't have yet. It builds on what already exists: medicines catalog, FEFO stock batches, POS with receipts, sales history, suppliers, purchase orders, reports, settings, and the admin console for creating, suspending and archiving pharmacies.

Each feature is marked with the effort it needs:

- **S:** a few days
- **M:** about 1–2 weeks
- **L:** several weeks

---

## 🔴 Priority 1: needed for day-to-day pharmacy operations

### 1. Staff accounts and roles per pharmacy (M)

**Today:** each pharmacy has exactly **one** login, the owner. Every cashier shares it, so sales can't be traced to a person.

**Add:**
- A pharmacy owner can invite staff with these roles:

  | Role | Access |
  |---|---|
  | `owner` | Everything, including settings and reports |
  | `pharmacist` | Dispensing, prescriptions, stock |
  | `cashier` | POS and sales history only |
  | `storekeeper` | Stock-in, purchase orders, adjustments |

- Each sale, adjustment and purchase order records the staff member who performed it. `StockMovement.userId` already supports this.
- The owner can deactivate a staff account without deleting its history.

### 2. Sales returns and refunds (M)

**Today:** a completed sale can't be reversed.

**Add:**
- A "Return" action in Sales History that supports a full or partial return per item.
- The return puts stock back into the **same batch**, unless the item is marked damaged or expired, in which case it is discarded.
- Each return records a reason and creates a `StockMovement` of type `return`.
- A credit note or refund receipt with its own number sequence, for example `RET-2026-000001`.
- Sales voided the same day before the drawer is closed, available to the owner role only.

### 3. Barcode scanning (S–M)

- Add `barcode` (and optionally `sku`) fields to Medicine, unique per pharmacy.
- In the POS, a USB scanner acts like a keyboard. Detect fast keyboard input ending in Enter and add the matching item to the cart.
- Use the scanner in Stock-in and Receive-PO for quick entry.
- Print barcode labels for medicines that come without them.

### 4. Automatic expiry handling and alerts (S)

**Today:** expired batches are left out of sales but stay `active` forever.

**Add:**
- A daily job (`node-cron` or a Render cron job) that:
  - marks batches past their expiry date as `expired` and records a `StockMovement`;
  - creates alerts for batches expiring within 30, 60 and 90 days, with configurable thresholds.
- An expiry dashboard: write-off value per month, and a "return to supplier" list.

### 5. Notifications center (S–M)

- A bell icon in the header listing alerts: low stock, expiring soon, expired today, purchase order overdue (past `expectedDelivery`), and pharmacy suspended (admin).
- Optional daily email or SMS summary for the owner. SMS is useful where email is less common.

### 6. Credit sales and customer accounts (M)

**Today:** `paymentMethod: 'credit'` and `paymentStatus: 'partial'/'pending'` exist in the model, but no feature uses them.

**Add:**
- A **Customer** model per pharmacy with name, phone, credit limit and balance.
- Selling on credit requires a selected customer and checks the credit limit.
- Record payments against open invoices.
- An accounts receivable report with aging buckets: 0–30, 31–60, 61–90 and 90+ days.

### 7. Cash drawer and shift closing (M)

- A cashier opens a shift with an opening cash float.
- At the end of the shift, the system shows expected cash, card and mobile-money totals against counted amounts, and records any variance.
- A Z-report (end-of-day summary) is printed or saved per shift.
- The owner can see shift history per cashier.

### 8. Forgot password / reset (S)

- An "Forgot password?" link on the login page sends a time-limited reset token by email.
- Admins can force-reset a pharmacist's password from the admin console.

---

## 🟠 Priority 2: inventory and procurement depth

### 9. Partial purchase-order receiving (M)

**Today:** an order is received all at once, exactly as ordered.

**Add:**
- Enter the received quantity per line. The order status becomes `partially_received` until everything arrives.
- Different batches or expiry dates for the same line, since suppliers often deliver mixed lots.
- Record bonus or free quantity, which is common in pharmaceutical distribution.
- Attach the supplier invoice number and date to the receipt.

### 10. Supplier payments and accounts payable (M)

- Record supplier invoices and payments, with the outstanding balance per supplier.
- Track due dates using the payment terms on each supplier.
- An accounts payable aging report.

### 11. Stock take / physical inventory count (M)

- Start a count session for all stock or for one category.
- Enter counted quantities per batch; the system shows the variance.
- When the session is approved, `correction` stock movements are created, with a variance value report.

### 12. Reorder suggestions and auto-PO (S–M)

- Calculate average daily sales per medicine over the last 30–90 days.
- Suggest an order quantity: `(avg daily sales × (lead time + safety days)) − current stock`.
- Create a draft purchase order from the suggestions with one click, grouped by preferred supplier.
- Add `preferredSupplierId` and `leadTimeDays` to Medicine.

### 13. Units and pack sizes (M)

- Track a base unit (tablet) and pack units (strip of 10, box of 100), with conversion factors.
- Buy in boxes, sell in strips or single tablets, with a separate price for each unit.
- Stock is always stored in the base unit.

### 14. Price management (S)

- Keep a price history per medicine, recording who changed it and when.
- Bulk price update by category or by percentage.
- Margin warnings when the selling price is below cost or below a minimum margin.

### 15. Stock movement history UI (S)

The backend already records every movement in `StockMovement`. Show them:
- A per-medicine and per-batch ledger with date, type, quantity change, balance, user and reference.
- Filters and export.

---

## 🟡 Priority 3: clinical and compliance

### 16. Prescription records (M)

The current version stores only a prescription number and prescriber on each sale.

**Add:**
- A Patient model with name, age or date of birth, sex, allergies and phone.
- Prescription records with patient, prescriber, date, an image upload of the paper prescription, and the items dispensed.
- A patient medication history.
- A refill tracking reminder.

### 17. Controlled substances register (M)

- Flag medicines as controlled (narcotics or psychotropics).
- Keep a mandatory register entry for each dispense: patient, prescriber, prescription number and running balance.
- A printable register report in the format regulators require.
- These medicines can be dispensed only by the `pharmacist` or `owner` role.

### 18. Drug interaction and allergy warnings (L)

- When a patient is selected in the POS, warn about known allergies and about interactions between the medicines in the cart.
- Start with a simple table of interaction pairs you maintain yourself. Later, connect to a drug database if one is available for your market.

### 19. Full audit log (S–M)

- Record who did what and when for sensitive actions: price changes, deletes and archives, stock adjustments, user changes and login attempts.
- The owner and admin can view and filter the log. Entries can't be deleted.

---

## 🟢 Priority 4: reporting and business tools

### 20. Export and print (S)

- CSV or Excel export for medicines, stock, sales, purchase orders and all reports.
- PDF export for reports and invoices.
- A print layout for thermal receipt printers (58 mm and 80 mm).

### 21. Additional reports (M)

- Profit by medicine and by category, using actual batch purchase prices.
- Sales by staff member and by shift.
- Slow-moving and dead stock (no sales in N days).
- Expiry loss report.
- Tax or VAT summary per period.
- Comparison with the previous period (this month against last month).

### 22. Tax configuration (S)

- A tax rate set per pharmacy, with an exemption flag per medicine.
- Tax is calculated automatically in the POS instead of being typed in.
- Receipts show tax registration numbers.

### 23. Multi-branch support (L)

- One owner or company can run several branches.
- Transfer stock between branches, with in-transit status.
- Consolidated reports across branches.

### 24. Admin platform features (M)

- Subscription plans and billing status per pharmacy, with automatic suspension when unpaid.
- The admin can open a pharmacy's data in read-only support mode. `x-pharmacy-id` scoping already exists in the backend.
- Platform-wide usage metrics: active pharmacies, sales volume and growth.
- Announcements broadcast to all pharmacies.

---

## 🔵 Priority 5: user experience and platform

### 25. Localization (M)

- Multi-language UI using `react-i18next`, including local languages for your market.
- A currency setting per pharmacy, with a currency symbol and formatting.
- Date formats, and optionally a local calendar on receipts.

### 26. Mobile money integration (L)

- Accept payments through local mobile-money providers in the POS, with payment confirmation and a stored transaction reference on the sale.

### 27. Offline-capable POS (L)

- Use a PWA with local storage so the POS keeps selling when the internet drops.
- Queued sales sync when the connection returns, with conflict handling for stock.

### 28. Data backup and import (S–M)

- Bulk import medicines and opening stock from Excel or CSV, for onboarding new pharmacies.
- Scheduled database backups (Atlas backups or a `mongodump` cron job), plus a "download my data" option for owners.

### 29. Keyboard-first POS (S)

- Shortcuts: F2 to search, F4 for quantity, F9 to complete the sale, Esc to clear the cart.
- Quick-pick buttons for frequently sold items.
- A held or parked sale, so the cashier can serve the next customer while the first one looks for money.

### 30. Code splitting and performance (S)

- The frontend bundle is over 500 kB. Lazy-load routes with `React.lazy`; Recharts is only needed on Reports and the Dashboard.
- Split the large page components (`Dashboard.jsx`, `POS.jsx`, `Reports.jsx`, `AdminDashboard.jsx`).

---

## Suggested roadmap

| Phase | Features | Why |
|---|---|---|
| **Phase 1** | 1 Staff & roles, 2 Returns, 4 Expiry job, 8 Password reset, 20 Export | Gaps that block real daily use |
| **Phase 2** | 3 Barcode, 6 Credit customers, 7 Shifts, 9 Partial receiving, 15 Movement history UI | POS speed and money accuracy |
| **Phase 3** | 5 Notifications, 11 Stock take, 12 Reorder suggestions, 14 Price management, 22 Tax | Inventory control |
| **Phase 4** | 16 Prescriptions, 17 Controlled register, 19 Audit log, 21 Reports | Compliance and insight |
| **Phase 5** | 10 Supplier payments, 13 Pack units, 23 Multi-branch, 24 Admin billing, 25–28 | Growth and scale |
