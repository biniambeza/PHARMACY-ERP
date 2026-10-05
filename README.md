# Pharmacy ERP — Enterprise Multi-Tenant Management System

[![MERN Stack](https://img.shields.io/badge/Stack-MERN-green.svg)](https://mongodb.com)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8-purple.svg)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8.svg)](https://tailwindcss.com)
[![Express](https://img.shields.io/badge/Express-5-lightgrey.svg)](https://expressjs.com)
[![Node.js](https://img.shields.io/badge/Node.js-v24-green.svg)](https://nodejs.org)

An enterprise-grade, multi-tenant **Pharmacy Enterprise Resource Planning (ERP)** system built with the MERN stack (MongoDB Atlas, Express 5, React 19, Node.js) and styled with Tailwind CSS v4. 

The platform supports complete pharmaceutical operational workflows: multi-tenant administration, centralized medicine catalogs, batch-level FEFO (First-Expired, First-Out) inventory tracking, an ultra-fast Cashier Point of Sale (POS) terminal with printable receipts, vendor procurement with automated stock-in conversion, and executive financial business intelligence.

---

## 🏛️ Architecture Overview

The system employs a **SaaS Multi-Tenant Architecture** using a unified database with strict, middleware-enforced tenant partitioning.

```
                              ┌──────────────────────────┐
                              │     React 19 Frontend    │
                              │    (Tailwind CSS v4)     │
                              └─────────────┬────────────┘
                                            │ JWT (Cookie / Bearer)
                                            ▼
                              ┌──────────────────────────┐
                              │    Express 5 API Gateway │
                              └─────────────┬────────────┘
                                            │
               ┌────────────────────────────┴───────────────────────────┐
               │                                                        │
               ▼                                                        ▼
    ┌─────────────────────┐                                  ┌─────────────────────┐
    │  System Admin Role  │                                  │   Pharmacist Role   │
    │  (Cross-Tenant Hub) │                                  │ (Single-Tenant ERP) │
    └──────────┬──────────┘                                  └──────────┬──────────┘
               │                                                        │
               │ Provisions Pharmacies                                  │ pharmacyScope
               │ & Pharmacist Accounts                                  │ Enforcement
               ▼                                                        ▼
┌──────────────────────────────┐                         ┌──────────────────────────────┐
│       Tenant Management      │                         │  Tenant-Partitioned Data:    │
│  - Pharmacy Licensing        │                         │  - Medicines Catalog         │
│  - Pharmacist Assignment     │                         │  - Stock Batches (FEFO)      │
│  - Tenant Status (Suspension)│                         │  - Cashier POS & Sales       │
│  - System-wide Analytics     │                         │  - Suppliers & Procurement   │
└──────────────────────────────┘                         │  - Financial Reports         │
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
- **Database Partitioning**: Every resource (`Medicine`, `StockBatch`, `Sale`, `Supplier`, `PurchaseOrder`) contains a required, indexed `pharmacyId` foreign key.
- **Tenant Uniqueness Constraints**: Uniqueness is scoped per pharmacy via compound indices (e.g., `{ pharmacyId: 1, name: 1 }` on Medicines and Suppliers, `{ pharmacyId: 1, medicineId: 1, batchNo: 1 }` on Stock Batches).
- **Access Guardrails**: A suspended pharmacy tenant immediately loses access to operational routes via middleware inspection.

---

## 👥 User Roles & Access Control

The platform implements strict **Role-Based Access Control (RBAC)** across the backend and frontend:

| Role | Access Level | Responsibilities |
|---|---|---|
| **System Admin** | System-Wide (`/admin`) | Provisions new pharmacies, assigns owner credentials, monitors global tenant counts, suspends or removes pharmacies. |
| **Pharmacist** | Single-Tenant (`/pharmacy/*`) | Combined Pharmacist, Cashier, and Inventory Manager. Manages medicines catalog, FEFO stock, cashier checkout, vendor procurement, and reports. |

---

## ✨ Core Features & Modules

### 1. Multi-Tenant Administration
- Create pharmacy entities with official license numbers, locations, and contact details.
- Automatically creates and binds the pharmacy's primary pharmacist account.
- Instant suspension and reactivation toggles for tenant lifecycle management.
- Real-time admin dashboard metrics (total pharmacies, active accounts, suspended accounts).

### 2. Medicine Catalog
- Centralized pharmaceutical product directory isolated per tenant.
- Product tracking: Brand name, generic name, category, dosage form (Tablet, Syrup, Injection, etc.), and strength.
- Dual pricing: Retail sales price and wholesale cost price for automated gross profit margin calculations.
- Prescription flags (`Rx Required` vs `Over The Counter - OTC`).

### 3. Inventory Management & FEFO Expiry Tracking
- **Batch-Level Tracking**: Each medication can have multiple distinct batches with independent lot numbers, quantities, and expiration dates.
- **FEFO Queuing**: All queries are automatically sorted by `expiryDate: 1` (First-Expired, First-Out).
- **Automated Lifecycle Transitions**: Batches automatically transition from `active` to `depleted` when quantity reaches zero, or to `expired` past their expiration date.
- **Stock Adjustments**: Formal adjustment module with reason auditing (`damaged`, `expired`, `correction/recount`) to write off damaged stock.
- **Proactive Alerts**: Dynamic indicators for low stock levels (`quantity <= minStockLevel`) and medicines expiring within 30 days.

### 4. Cashier Point of Sale (POS) & Invoicing
- **High-Velocity POS Terminal**: Live searchable medication catalog with immediate in-stock quantity badges and out-of-stock lockouts.
- **Interactive Cart**: Stepper controls with stock maximum availability bounds.
- **Automated FEFO Stock Deduction**: When an item is sold, the backend automatically consumes stock from the earliest-expiring batch first. If an order spans multiple batches, each batch is decremented proportionally.
- **Multi-Tender Payments**: Supports `cash`, `card`, `mobile_money`, and `credit`.
- **Itemized Printable Invoices**: Instant modal pop-up with clean `@media print` styling for receipt printing (`window.print()`), displaying consumed batch numbers and sales tax/discount breakdowns.
- **Audit History**: Complete sales ledger with patient/invoice search and daily revenue totals.

### 5. Procurement & Purchase Orders
- **Suppliers Directory**: Maintain pharmaceutical distributors, manufacturers, phone numbers, and delivery terms.
- **Purchase Order Builder**: Multi-item PO generation with automated `PO-XXXXXX-XXXX` numbering and estimated procurement costs.
- **Automated Stock-In Delivery Conversion**: When a vendor delivers an order, the pharmacist confirms delivery by entering batch numbers and expiration dates. The system automatically converts the delivery into active `StockBatch` records.

### 6. Financial Reports & Business Intelligence
- **Executive KPIs**: Gross Revenue, Cost of Goods Sold (COGS), Gross Profit, and Gross Profit Margin (%).
- **Visual 7-Day Revenue Trend**: Daily bar charts displaying daily revenues and transaction counts.
- **Payment Method Distribution**: Comparative volume analysis across Cash, Card, and Mobile Money.
- **Top 5 Bestselling Medicines**: Ranked by revenue volume and gross profit contribution.
- **30-Day Expiry Risk Valuation**: Calculates total inventory dollar valuation at risk of expiration (cost price vs retail price).

### 7. Tenant Settings & Profile Management
- Pharmacists can update their business phone number, address, and receipt notes.
- Secure password change module requiring verification of the existing password.

---

## 🛠️ Technology Stack

### Frontend
- **Framework**: [React 19](https://react.dev/) + [Vite 8](https://vitejs.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Routing**: [React Router v7](https://reactrouter.com/)
- **HTTP Client**: [Axios](https://axios-http.com/) (with automatic JWT authorization interceptors)

### Backend
- **Runtime**: [Node.js](https://nodejs.org/) (v24+)
- **Server Framework**: [Express 5](https://expressjs.com/)
- **Database & ODM**: [MongoDB Atlas](https://www.mongodb.com/atlas) with [Mongoose 8](https://mongoosejs.com/)
- **Authentication**: [JSON Web Tokens (JWT)](https://jwt.io/) + [Bcrypt.js](https://github.com/dcodeIO/bcrypt.js)
- **Utilities**: `cookie-parser`, `cors`, `dotenv`, `nodemon`

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

### Financial Reports & Analytics (`/api/reports`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/reports/analytics` | Pharmacist | Get gross margins, daily trends, bestsellers & expiry risks |

---

## 📂 Project Directory Structure

```
PHARMACY-ERP/
├── backend/
│   ├── config/
│   │   └── db.js                        # MongoDB Atlas connection
│   ├── controllers/
│   │   ├── adminController.js           # Pharmacy provisioning & platform stats
│   │   ├── authController.js            # Login & authentication
│   │   ├── medicineController.js        # Medicine catalog CRUD
│   │   ├── pharmacyController.js        # Tenant settings & profile
│   │   ├── purchaseOrderController.js   # Procurement & delivery stock-in
│   │   ├── reportController.js          # Financial business intelligence
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
│   │   └── seedAdmin.js                 # Initial admin account seeder
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
    │   │   ├── reportApi.js
    │   │   ├── salesApi.js
    │   │   ├── stockApi.js
    │   │   └── supplierApi.js
    │   ├── context/
    │   │   └── AuthContext.jsx          # Global auth state & user session
    │   ├── pages/
    │   │   ├── admin/
    │   │   │   ├── AdminDashboard.jsx   # Admin portal
    │   │   │   └── CreatePharmacyModal.jsx
    │   │   ├── auth/
    │   │   │   └── Login.jsx            # Authentication page
    │   │   └── pharmacist/
    │   │       ├── CreatePOModal.jsx    # Issue purchase order modal
    │   │       ├── Dashboard.jsx        # Unified pharmacist command center
    │   │       ├── InvoiceReceiptModal.jsx # Printable receipt layout
    │   │       ├── MedicineModal.jsx    # Add/edit medicine modal
    │   │       ├── Medicines.jsx        # Medicine catalog page
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
    │   ├── index.css                    # Tailwind CSS v4 styling
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

3. Seed the Initial Admin Account:
   ```bash
   node utils/seedAdmin.js
   ```
   *Default Admin Credentials:*
   - **Email**: `admin@pharmacy.com`
   - **Password**: `admin123456`

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
   - Sign out and log in with the newly created pharmacist credentials.
   - You will land on the **Pharmacist Dashboard** bound to that pharmacy tenant.
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

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).
