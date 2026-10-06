# Pharmacy ERP — Enterprise Multi-Tenant Management System

[![MERN Stack](https://img.shields.io/badge/Stack-MERN-green.svg)](https://mongodb.com)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8-purple.svg)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8.svg)](https://tailwindcss.com)
[![Express](https://img.shields.io/badge/Express-5-lightgrey.svg)](https://expressjs.com)
[![Node.js](https://img.shields.io/badge/Node.js-v24-green.svg)](https://nodejs.org)
[![CI/CD](https://img.shields.io/badge/GitHub_Actions-Passing-success.svg)](.github/workflows/ci-cd.yml)
[![Theme](https://img.shields.io/badge/Theme-Light%20%7C%20Dark%20Mode-slate.svg)](#-modern-erp-ui--theme-system)

An enterprise-grade, multi-tenant **Pharmacy Enterprise Resource Planning (ERP)** software suite built with the modern MERN stack (MongoDB Atlas, Express 5, React 19, Node.js) and styled with Tailwind CSS v4.

Designed to meet the stringent demands of high-throughput clinical and retail pharmacies, the platform delivers multi-tenant administration, centralized medicine catalogs, batch-level **FEFO (First-Expired, First-Out)** inventory tracking, an ultra-fast Cashier Point of Sale (POS) terminal with printable receipts, automated vendor procurement conversions, and a **100% real-time database-driven executive overview** with full **Dark & Light Mode** support.

---

## 🏛️ System Architecture

The application implements a **SaaS Multi-Tenant Architecture** using a unified database with strict, middleware-enforced tenant partitioning.

```
                              ┌────────────────────────────────────────┐
                              │           React 19 Frontend            │
                              │    (Tailwind v4 · Dark/Light Mode)     │
                              └───────────────────┬────────────────────┘
                                                  │ JWT (Cookie / Bearer)
                                                  ▼
                              ┌────────────────────────────────────────┐
                              │          Express 5 API Gateway         │
                              └───────────────────┬────────────────────┘
                                                  │
                ┌─────────────────────────────────┴─────────────────────────────────┐
                │                                                                   │
                ▼                                                                   ▼
     ┌─────────────────────┐                                             ┌─────────────────────┐
     │  System Admin Role  │                                             │   Pharmacist Role   │
     │  (Cross-Tenant Hub) │                                             │ (Single-Tenant ERP) │
     └──────────┬──────────┘                                             └──────────┬──────────┘
                │                                                                   │
                │ Provisions Pharmacies                                             │ pharmacyScope
                │ & Pharmacist Credentials                                          │ Enforcement
                ▼                                                                   ▼
 ┌──────────────────────────────┐                                    ┌──────────────────────────────┐
 │       Tenant Management      │                                    │  Tenant-Partitioned Data:    │
 │  - Pharmacy Licensing        │                                    │  - Real-Time Live Overview   │
 │  - Pharmacist Assignment     │                                    │  - Medicines Catalog         │
 │  - Tenant Suspension Toggles │                                    │  - FEFO Stock Batches        │
 │  - Platform-wide Analytics   │                                    │  - Cashier POS & Sales Ledger│
 └──────────────────────────────┘                                    │  - Suppliers & Procurement   │
                                                                     │  - Financial Reports & BI    │
                                                                     └──────────────┬───────────────┘
                                                                                    │
                                                                                    ▼
                                                                     ┌──────────────────────────────┐
                                                                     │     MongoDB Atlas Cluster    │
                                                                     │ (Compound Indexed Isolation) │
                                                                     └──────────────────────────────┘
```

### 🔒 Tenant Data Isolation Strategy
- **`pharmacyScope` Middleware**: Resolves the authenticated user's assigned pharmacy tenant (`req.pharmacyId` and `req.pharmacy`) on every private request.
- **Database Partitioning**: Every collection (`Medicine`, `StockBatch`, `Sale`, `Supplier`, `PurchaseOrder`) contains a required, indexed `pharmacyId` foreign key.
- **Compound Uniqueness Constraints**: Uniqueness is strictly scoped per pharmacy (e.g., `{ pharmacyId: 1, name: 1 }` on Medicines and Suppliers, `{ pharmacyId: 1, medicineId: 1, batchNo: 1 }` on Stock Batches).
- **Access Guardrails**: A suspended pharmacy tenant immediately loses access to operational routes via middleware inspection.

---

## 👥 User Roles & Access Control

The platform enforces strict **Role-Based Access Control (RBAC)** across the backend and frontend:

| Role | Access Level | Responsibilities |
|---|---|---|
| **System Admin** | System-Wide (`/admin`) | Provisions new pharmacies, assigns owner credentials, monitors global tenant counts, suspends or removes pharmacies. |
| **Pharmacist** | Single-Tenant (`/pharmacy/*`) | Manages medicines catalog, FEFO stock batches, cashier checkout, vendor procurement, team tasks, and financial business intelligence. |

---

## ✨ Core Features & Modules

### 1. Modern ERP UI & Theme System
- **Enterprise Sidebar Navigation**: Dedicated collapsible navigation bar inspired by professional enterprise ERP suites (`PharmacyLayout.jsx`), featuring:
  - Active navigation pill indicators with real-time route syncing.
  - Pharmacy tenant status badge and verified license indicator.
  - Quick action links and category groupings (Overview, Dispensary, Inventory, Supply Chain, Intelligence, System).
- **Dark & Light Mode Engine**:
  - Class-based theme system (`ThemeContext.jsx`) leveraging Tailwind CSS v4.
  - Instant toggle button with smooth icon transitions (Sun/Moon).
  - Remembers user preference in `localStorage.theme` with fallback to system OS dark mode preferences.
  - Deep-slate contrast palette (`#111827`, `#0f172a`) optimized for eye comfort during long cashier and management shifts.

### 2. 100% Real-Time Database Overview Command Center
- **Direct Database Aggregations**: Replaces static/dummy mockups with live MongoDB metrics via `GET /api/reports/overview`:
  - **5 Key Metric Cards**: Real-time figures for **Total Revenue**, **Total Expenses**, **Net Profit**, **Active Lots**, and **Catalog Medicines**, complete with growth indicators.
  - **Revenue vs. Expenses Trend Chart**: Custom interactive SVG dual-line graph tracking operational cash inflows vs. procurement expenditures across time buckets.
  - **Workflow Status Donut**: Visual purchase order lifecycle distribution (`Received`, `Ordered`, `Draft`, `Cancelled`).
  - **Inventory Health Donut**: Real breakdown of catalog items into `In Stock`, `Low Stock` (below item threshold), `Out of Stock`, and pending incoming units.
  - **Pending Procurement Card**: Committed capital and unit volume currently in `ordered` status from distributors.
  - **Batch Lifecycle & FEFO Expiry Donut**: Real-time lot categorization into **Healthy** (>60 days), **At Risk** (30–60 days), **Critical Expiry** (<30 days), and **Depleted** (0 units).
  - **Operational Tasks & Alerts Checklist**: Dynamically generated action items derived from live database anomalies (low stock restocks, near-expiry lots, pending deliveries) with interactive checkbox state persistence.
  - **Live Activity Stream**: Unified event feed merging customer sales, incoming stock lot receipts, and purchase order tracking with relative timestamps.
  - **Top Suppliers Spend Leaderboard**: Actual procurement spending totals, order history, and distributor contact details.

### 3. Multi-Tenant Administration
- Create pharmacy entities with official license numbers, locations, and contact details.
- Automatically creates and binds the pharmacy's primary pharmacist account.
- Instant suspension and reactivation toggles for tenant lifecycle management.
- Real-time admin dashboard metrics (total pharmacies, active accounts, suspended accounts).

### 4. Medicine Catalog
- Centralized pharmaceutical product directory isolated per tenant.
- Product tracking: Brand name, generic name, category, dosage form (Tablet, Syrup, Injection, etc.), and strength.
- Dual pricing: Retail sales price and wholesale cost price for automated gross profit margin calculations.
- Prescription flags (`Rx Required` vs `Over The Counter - OTC`).

### 5. Inventory Management & FEFO Expiry Tracking
- **Batch-Level Tracking**: Each medication can have multiple distinct batches with independent lot numbers, quantities, and expiration dates.
- **FEFO Queuing**: All queries are automatically sorted by `expiryDate: 1` (First-Expired, First-Out).
- **Automated Lifecycle Transitions**: Batches automatically transition from `active` to `depleted` when quantity reaches zero, or to `expired` past their expiration date.
- **Stock Adjustments**: Formal adjustment module with reason auditing (`damaged`, `expired`, `correction/recount`) to write off damaged stock.
- **Proactive Alerts**: Dynamic indicators for low stock levels (`quantity <= minStockLevel`) and medicines expiring within 30 days.

### 6. Cashier Point of Sale (POS) & Invoicing
- **High-Velocity POS Terminal**: Live searchable medication catalog with immediate in-stock quantity badges and out-of-stock lockouts.
- **Interactive Cart**: Stepper controls with stock maximum availability bounds.
- **Automated FEFO Stock Deduction**: When an item is sold, the backend automatically consumes stock from the earliest-expiring batch first. If an order spans multiple batches, each batch is decremented proportionally.
- **Multi-Tender Payments**: Supports `cash`, `card`, `mobile_money`, and `credit`.
- **Itemized Printable Invoices**: Instant modal pop-up with clean `@media print` styling for receipt printing (`window.print()`), displaying consumed batch numbers and sales tax/discount breakdowns.
- **Audit History**: Complete sales ledger with patient/invoice search and daily revenue totals.

### 7. Procurement & Purchase Orders
- **Suppliers Directory**: Maintain pharmaceutical distributors, manufacturers, phone numbers, and delivery terms.
- **Purchase Order Builder**: Multi-item PO generation with automated `PO-XXXXXX-XXXX` numbering and estimated procurement costs.
- **Automated Stock-In Delivery Conversion**: When a vendor delivers an order, the pharmacist confirms delivery by entering batch numbers and expiration dates. The system automatically converts the delivery into active `StockBatch` records.

### 8. Financial Reports & Business Intelligence
- **Executive KPIs**: Gross Revenue, Cost of Goods Sold (COGS), Gross Profit, and Gross Profit Margin (%).
- **Visual 7-Day Revenue Trend**: Daily bar charts displaying daily revenues and transaction counts.
- **Payment Method Distribution**: Comparative volume analysis across Cash, Card, and Mobile Money.
- **Top 5 Bestselling Medicines**: Ranked by revenue volume and gross profit contribution.
- **30-Day Expiry Risk Valuation**: Calculates total inventory dollar valuation at risk of expiration (cost price vs retail price).

### 9. Tenant Settings & Profile Management
- Pharmacists can update their business phone number, address, and receipt notes.
- Secure password change module requiring verification of the existing password.

---

## 🛠️ Technology Stack

### Frontend
- **Framework**: [React 19](https://react.dev/) + [Vite 8](https://vitejs.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Theming**: Custom React Context theme provider with Tailwind `class` mode and `localStorage` persistence
- **Routing**: [React Router v7](https://reactrouter.com/)
- **HTTP Client**: [Axios](https://axios-http.com/) (with automatic JWT authorization interceptors)

### Backend
- **Runtime**: [Node.js](https://nodejs.org/) (v24+)
- **Server Framework**: [Express 5](https://expressjs.com/)
- **Database & ODM**: [MongoDB Atlas](https://www.mongodb.com/atlas) with [Mongoose 8](https://mongoosejs.com/)
- **Authentication**: [JSON Web Tokens (JWT)](https://jwt.io/) + [Bcrypt.js](https://github.com/dcodeIO/bcrypt.js)
- **Utilities**: `cookie-parser`, `cors`, `dotenv`, `nodemon`

### DevOps & Quality Assurance
- **CI/CD**: [GitHub Actions](https://github.com/features/actions) with automated multi-stage linting, testing, and deployment hooks
- **Linting**: ESLint 9 with React 19 configuration

---

## 📡 REST API Reference

All protected endpoints require authentication via Bearer Token (`Authorization: Bearer <token>`) or HTTP-only cookie.

### Authentication (`/api/auth`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public | Authenticate user & issue JWT token |
| `GET` | `/api/auth/me` | Private | Retrieve current user profile & role |

### System Administration (`/api/admin`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/admin/pharmacies` | Admin | List all registered pharmacies with metrics |
| `POST` | `/api/admin/pharmacies` | Admin | Provision new pharmacy & owner pharmacist |
| `PATCH` | `/api/admin/pharmacies/:id/status` | Admin | Toggle pharmacy status (`active`/`suspended`) |
| `DELETE` | `/api/admin/pharmacies/:id` | Admin | Delete pharmacy and its associated users |
| `GET` | `/api/admin/stats` | Admin | Retrieve system-wide platform statistics |

### Pharmacy Profile & Settings (`/api/pharmacy`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/pharmacy/my-pharmacy` | Pharmacist | Get current tenant details & isolation check |
| `PUT` | `/api/pharmacy/my-pharmacy` | Pharmacist | Update pharmacy phone and physical address |
| `PUT` | `/api/pharmacy/profile` | Pharmacist | Update pharmacist name or change password |

### Real-Time Reports & Executive Overview (`/api/reports`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/reports/overview` | Pharmacist | **Get real-time dashboard overview aggregated across all tenant collections** (KPIs, dual-line trend, donuts, tasks, activities, suppliers) |
| `GET` | `/api/reports/analytics` | Pharmacist | Get gross margins, daily trends, bestsellers & expiry risks |

### Medicines Catalog (`/api/medicines`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/medicines` | Pharmacist | List medicines (with search & category filter) |
| `POST` | `/api/medicines` | Pharmacist | Create new medicine in tenant catalog |
| `GET` | `/api/medicines/categories`| Pharmacist | Get list of existing medicine categories |
| `GET` | `/api/medicines/:id` | Pharmacist | Get single medicine details |
| `PUT` | `/api/medicines/:id` | Pharmacist | Update medicine information |
| `DELETE` | `/api/medicines/:id` | Pharmacist | Remove medicine from catalog |

### Stock & Inventory (`/api/stock`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/stock` | Pharmacist | List stock batches (sorted by FEFO expiry date) |
| `POST` | `/api/stock` | Pharmacist | Direct stock-in: add new batch with expiry date |
| `PATCH` | `/api/stock/:id/adjust` | Pharmacist | Adjust stock (damaged, expired, discrepancy) |
| `GET` | `/api/stock/summary` | Pharmacist | Get inventory counts, low stock & expiry alerts |
| `DELETE` | `/api/stock/:id` | Pharmacist | Remove stock batch |

### Cashier POS & Sales (`/api/sales`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/sales` | Pharmacist | Process sale with automatic FEFO batch consumption |
| `GET` | `/api/sales` | Pharmacist | List sales history with customer/invoice search |
| `GET` | `/api/sales/summary` | Pharmacist | Get today's and all-time sales metrics |
| `GET` | `/api/sales/:id` | Pharmacist | Get single transaction & receipt details |

### Suppliers Directory (`/api/suppliers`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/suppliers` | Pharmacist | List registered suppliers |
| `POST` | `/api/suppliers` | Pharmacist | Add new pharmaceutical distributor |
| `GET` | `/api/suppliers/:id` | Pharmacist | Get supplier details |
| `PUT` | `/api/suppliers/:id` | Pharmacist | Update supplier contact info |
| `DELETE` | `/api/suppliers/:id` | Pharmacist | Remove supplier |

### Procurement & Purchase Orders (`/api/procurement`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/procurement/orders` | Pharmacist | List purchase orders with status filter |
| `POST` | `/api/procurement/orders` | Pharmacist | Create new multi-item purchase order |
| `GET` | `/api/procurement/orders/:id` | Pharmacist | Get purchase order details |
| `PATCH` | `/api/procurement/orders/:id/receive`| Pharmacist | Receive delivery and convert to active stock batches |
| `PATCH` | `/api/procurement/orders/:id/cancel` | Pharmacist | Cancel pending purchase order |

---

## 📂 Project Directory Structure

```
PHARMACY-ERP/
├── .github/
│   └── workflows/
│       └── ci-cd.yml                    # Automated multi-stage GitHub Actions CI/CD
│
├── backend/
│   ├── config/
│   │   └── db.js                        # MongoDB Atlas connection
│   ├── controllers/
│   │   ├── adminController.js           # Pharmacy provisioning & platform stats
│   │   ├── authController.js            # Login & authentication
│   │   ├── medicineController.js        # Medicine catalog CRUD
│   │   ├── pharmacyController.js        # Tenant settings & profile
│   │   ├── purchaseOrderController.js   # Procurement & delivery stock-in
│   │   ├── reportController.js          # Live overview aggregations & BI analytics
│   │   ├── salesController.js           # POS checkout & FEFO consumption
│   │   ├── stockController.js           # Batches, adjustments & alerts
│   │   └── supplierController.js        # Supplier directory CRUD
│   ├── middleware/
│   │   ├── authMiddleware.js            # JWT protection
│   │   ├── pharmacyScope.js             # Tenant data isolation engine
│   │   └── roleMiddleware.js            # Role-based route authorization
│   ├── models/
│   │   ├── Medicine.js                  # Medication schema
│   │   ├── Pharmacy.js                  # Pharmacy tenant schema
│   │   ├── PurchaseOrder.js             # Procurement order schema
│   │   ├── Sale.js                      # Sales transaction schema
│   │   ├── StockBatch.js                # Inventory batch schema (FEFO)
│   │   ├── Supplier.js                  # Vendor contact schema
│   │   └── User.js                      # Authentication credentials schema
│   ├── routes/
│   │   ├── adminRoutes.js
│   │   ├── authRoutes.js
│   │   ├── medicineRoutes.js
│   │   ├── pharmacyRoutes.js
│   │   ├── procurementRoutes.js
│   │   ├── reportRoutes.js
│   │   ├── salesRoutes.js
│   │   ├── stockRoutes.js
│   │   └── supplierRoutes.js
│   ├── utils/
│   │   ├── generateToken.js             # JWT signer
│   │   ├── seedAdmin.js                 # Initial admin account seeder
│   │   └── seedPharmacyData.js          # Comprehensive realistic pharmacy dataset seeder
│   ├── .env                             # Environment configuration
│   ├── package.json
│   └── server.js                        # Express app entrypoint
│
└── frontend/
    ├── src/
    │   ├── api/                         # Axios client & modular API helpers
    │   │   ├── adminApi.js
    │   │   ├── axios.js
    │   │   ├── medicineApi.js
    │   │   ├── pharmacyApi.js
    │   │   ├── procurementApi.js
    │   │   ├── reportApi.js             # Includes getDashboardOverview()
    │   │   ├── salesApi.js
    │   │   ├── stockApi.js
    │   │   └── supplierApi.js
    │   ├── context/
    │   │   ├── AuthContext.jsx          # Global auth state & user session
    │   │   └── ThemeContext.jsx         # Dark/Light mode theme state & persistence
    │   ├── pages/
    │   │   ├── admin/
    │   │   │   ├── AdminDashboard.jsx   # Admin management portal
    │   │   │   ├── AdminLayout.jsx      # Enterprise admin sidebar layout & theme toggle
    │   │   │   └── CreatePharmacyModal.jsx
    │   │   ├── auth/
    │   │   │   └── Login.jsx            # Authentication page
    │   │   └── pharmacist/
    │   │       ├── CreatePOModal.jsx    # Issue purchase order modal
    │   │       ├── Dashboard.jsx        # Live database-driven command center
    │   │       ├── InvoiceReceiptModal.jsx # Printable receipt layout
    │   │       ├── MedicineModal.jsx    # Add/edit medicine modal
    │   │       ├── Medicines.jsx        # Medicine catalog page
    │   │       ├── PharmacyLayout.jsx   # Professional ERP sidebar layout & theme toggle
    │   │       ├── POS.jsx              # Cashier point of sale terminal
    │   │       ├── PurchaseOrders.jsx   # Procurement management page
    │   │       ├── ReceivePOModal.jsx   # Delivery receiving modal
    │   │       ├── Reports.jsx          # Financial analytics & risk page
    │   │       ├── SalesHistory.jsx     # Sales & transactions ledger
    │   │       ├── Settings.jsx         # Pharmacy profile & password settings
    │   │       ├── Stock.jsx            # Inventory & batch tracking page
    │   │       ├── StockAdjustModal.jsx # Stock deduction modal
    │   │       ├── StockInModal.jsx     # Direct stock-in modal
    │   │       ├── SupplierModal.jsx    # Add/edit supplier modal
    │   │       └── Suppliers.jsx        # Suppliers directory page
    │   ├── routes/
    │   │   ├── ProtectedRoute.jsx       # Auth boundary
    │   │   └── RoleRoute.jsx            # Role permission boundary
    │   ├── App.jsx                      # App route definitions
    │   ├── index.css                    # Tailwind CSS v4 styling & dark theme tokens
    │   └── main.jsx
    ├── package.json
    └── vite.config.js
```

---

## ⚡ Getting Started & Installation

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher; v24 recommended)
- [MongoDB Atlas](https://www.mongodb.com/atlas) account (or a local MongoDB instance)
- Git

### 1. Clone Repository
```bash
git clone https://github.com/biniambeza/PHARMACY-ERP.git
cd PHARMACY-ERP
```

### 2. Backend Setup
1. Navigate to the backend directory and install dependencies:
   ```bash
   cd backend
   npm install
   ```

2. Create a `.env` file in `backend/`:
   ```env
   PORT=5000
   NODE_ENV=development
   MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/pharmacy-erp?retryWrites=true&w=majority
   JWT_SECRET=your_super_secret_jwt_key_here
   CLIENT_URL=http://localhost:5173
   ```

3. **Seed Initial Accounts & Data**:
   
   - **Seed Admin**:
     ```bash
     node utils/seedAdmin.js
     ```
     *Default Admin Credentials:*
     - **Email**: `admin@pharmacy.com`
     - **Password**: `admin123456`

   - **Seed Realistic Pharmacy Operational Dataset**:
     ```bash
     node utils/seedPharmacyData.js
     ```
     *Populates 12 medicines, 5 pharmaceutical distributors, 15 FEFO stock batches, 4 purchase orders, and 16 sales transactions for the active pharmacy tenant, making the overview dashboard instantly populated with live numbers.*

4. Start the backend development server:
   ```bash
   npm run dev
   ```
   *Backend will run on `http://localhost:5000`.*

### 3. Frontend Setup
1. Open a new terminal, navigate to the frontend directory and install dependencies:
   ```bash
   cd frontend
   npm install
   ```

2. Start the Vite development server:
   ```bash
   npm run dev
   ```
   *Frontend will run on `http://localhost:5173`.*

---

## 🎯 Quick Workflow Guide

1. **Log in as System Admin**:
   - Navigate to `http://localhost:5173/login`.
   - Log in with `admin@pharmacy.com` / `admin123456`.
   - Click **+ Add Pharmacy** to provision a new pharmacy and assign its pharmacist login credentials.
2. **Log in as Pharmacist**:
   - Sign out and log in with your pharmacist credentials.
   - You will land on the **Pharmacist Dashboard Overview** with live metrics, trends, and task lists.
   - Use the **Theme Toggle** in the sidebar to switch between Light and Dark mode.
3. **Build the Pharmacy Catalog**:
   - Open **Medicine Catalog** (`/pharmacy/medicines`) to add prescription or OTC medications.
4. **Receive Inventory**:
   - Open **Stock & Batches** (`/pharmacy/stock`) and click **Receive Stock** to add batches with expiration dates.
5. **Ring up Sales (POS)**:
   - Open **Cashier & POS** (`/pharmacy/pos`), add medicines to cart, specify customer details, choose payment method, and complete checkout.
   - Print the instant invoice receipt and review the FEFO-depleted batches!
6. **Procurement**:
   - Register suppliers in **Suppliers Directory** (`/pharmacy/suppliers`).
   - Create purchase orders in **Purchase Orders** (`/pharmacy/procurement`) and receive stock deliveries.
7. **View Financial Reports**:
   - Open **Financial Reports** (`/pharmacy/reports`) to evaluate profit margins, bestselling products, and 30-day expiry risks.

---

## 🚀 GitHub Actions CI/CD Pipeline

The project includes an automated multi-stage CI/CD workflow defined in [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml):

```
┌────────────────────────────────────────────────────────┐
│               GitHub Push / Pull Request               │
└───────────────────────────┬────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
   ┌────────────────────┐      ┌────────────────────┐
   │    Backend CI      │      │    Frontend CI     │
   │  - Node.js 20      │      │  - Node.js 20      │
   │  - Syntax verify   │      │  - ESLint pass     │
   │  - Route/Model test│      │  - Vite build      │
   └──────────┬─────────┘      └──────────┬─────────┘
              │                           │
              └─────────────┬─────────────┘
                            │ (on push to main)
              ┌─────────────┴─────────────┐
              ▼                           ▼
   ┌────────────────────┐      ┌────────────────────┐
   │ Deploy Backend     │      │ Deploy Frontend    │
   │ (Render / Railway) │      │ (Vercel)           │
   └────────────────────┘      └────────────────────┘
```

### Continuous Deployment Secrets (Optional)
To enable automated deployments upon pushing to `main`, set the following secrets in your GitHub repository (**Settings** ➔ **Secrets and variables** ➔ **Actions**):
- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (for frontend deployment to Vercel)
- `RENDER_DEPLOY_HOOK_URL` (for backend deploy triggering on Render)

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).
