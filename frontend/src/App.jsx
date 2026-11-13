import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './routes/ProtectedRoute';
import RoleRoute from './routes/RoleRoute';
import AdminLayout from './pages/admin/AdminLayout';
import PharmacyLayout from './pages/pharmacist/PharmacyLayout';
import PermissionRoute from './routes/PermissionRoute';
import { MetricCardSkeleton, TableSkeleton } from './components/common/SkeletonLoader';

// Pages are lazy-loaded (route-level code splitting, #30); layouts stay in the main chunk.
const Login = lazy(() => import('./pages/auth/Login'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const PharmacistDashboard = lazy(() => import('./pages/pharmacist/Dashboard'));
const Medicines = lazy(() => import('./pages/pharmacist/Medicines'));
const Stock = lazy(() => import('./pages/pharmacist/Stock'));
const POS = lazy(() => import('./pages/pharmacist/POS'));
const SalesHistory = lazy(() => import('./pages/pharmacist/SalesHistory'));
const Suppliers = lazy(() => import('./pages/pharmacist/Suppliers'));
const PurchaseOrders = lazy(() => import('./pages/pharmacist/PurchaseOrders'));
const Reports = lazy(() => import('./pages/pharmacist/Reports'));
const Settings = lazy(() => import('./pages/pharmacist/Settings'));
const Staff = lazy(() => import('./pages/pharmacist/Staff'));
const Returns = lazy(() => import('./pages/pharmacist/Returns'));
const Expiry = lazy(() => import('./pages/pharmacist/Expiry'));
const Notifications = lazy(() => import('./pages/pharmacist/Notifications'));
const Customers = lazy(() => import('./pages/pharmacist/Customers'));
const Payables = lazy(() => import('./pages/pharmacist/Payables'));
const Reorder = lazy(() => import('./pages/pharmacist/Reorder'));
const StockTake = lazy(() => import('./pages/pharmacist/StockTake'));
const Movements = lazy(() => import('./pages/pharmacist/Movements'));
const Import = lazy(() => import('./pages/pharmacist/Import'));
const Patients = lazy(() => import('./pages/pharmacist/Patients'));
const ControlledRegister = lazy(() => import('./pages/pharmacist/ControlledRegister'));
const Interactions = lazy(() => import('./pages/pharmacist/Interactions'));
const AuditLog = lazy(() => import('./pages/pharmacist/AuditLog'));
const Transfers = lazy(() => import('./pages/pharmacist/Transfers'));
const Shifts = lazy(() => import('./pages/pharmacist/Shifts'));
const Insurance = lazy(() => import('./pages/pharmacist/Insurance'));
const EInvoicing = lazy(() => import('./pages/pharmacist/EInvoicing'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));

// Suspense fallback shown while a page chunk downloads.
const PageFallback = () => {
  const { t } = useTranslation();
  return (
  <div className="p-6 space-y-6" role="status" aria-busy="true" aria-live="polite">
    <span className="sr-only">{t('labels.loading')}</span>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <MetricCardSkeleton key={i} />
      ))}
    </div>
    <TableSkeleton rows={6} cols={5} />
  </div>
  );
};

const lazyPage = (element) => <Suspense fallback={<PageFallback />}>{element}</Suspense>;

// Pharmacy portal pages and the permission each one requires (null = any staff).
const pharmacyPages = [
  { path: '/pharmacy', element: <PharmacistDashboard />, perm: 'dashboard:view' },
  { path: '/pharmacy/medicines', element: <Medicines />, perm: 'medicine:view' },
  { path: '/pharmacy/stock', element: <Stock />, perm: 'stock:view' },
  { path: '/pharmacy/pos', element: <POS />, perm: 'sales:create' },
  { path: '/pharmacy/sales', element: <SalesHistory />, perm: 'sales:view' },
  { path: '/pharmacy/suppliers', element: <Suppliers />, perm: 'supplier:view' },
  { path: '/pharmacy/procurement', element: <PurchaseOrders />, perm: 'po:view' },
  { path: '/pharmacy/reports', element: <Reports />, perm: 'reports:view' },
  { path: '/pharmacy/settings', element: <Settings />, perm: null },
  { path: '/pharmacy/staff', element: <Staff />, perm: 'staff:manage' },
  { path: '/pharmacy/returns', element: <Returns />, perm: 'sales:return' },
  { path: '/pharmacy/expiry', element: <Expiry />, perm: 'stock:view' },
  { path: '/pharmacy/notifications', element: <Notifications />, perm: 'notifications:view' },
  { path: '/pharmacy/customers', element: <Customers />, perm: 'customer:view' },
  { path: '/pharmacy/payables', element: <Payables />, perm: 'supplier:pay' },
  { path: '/pharmacy/reorder', element: <Reorder />, perm: 'po:view' }, // backend: suggestions need po:view, creating POs po:manage (gated in-page)
  { path: '/pharmacy/stock-take', element: <StockTake />, perm: 'stock:take' },
  { path: '/pharmacy/movements', element: <Movements />, perm: 'stock:view' },
  { path: '/pharmacy/import', element: <Import />, perm: 'data:import' },
  { path: '/pharmacy/patients', element: <Patients />, perm: 'patient:view' },
  { path: '/pharmacy/controlled', element: <ControlledRegister />, perm: 'controlled:view' },
  { path: '/pharmacy/interactions', element: <Interactions />, perm: 'interaction:manage' },
  { path: '/pharmacy/audit', element: <AuditLog />, perm: 'audit:view' },
  { path: '/pharmacy/transfers', element: <Transfers />, perm: 'transfer:manage' },
  { path: '/pharmacy/shifts', element: <Shifts />, perm: 'shift:own' },
  { path: '/pharmacy/insurance', element: <Insurance />, perm: 'insurance:manage' },
  { path: '/pharmacy/einvoice', element: <EInvoicing />, perm: 'einvoice:view' },
];

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
        <Routes>
          {/* Public Auth Route */}
          <Route path="/login" element={lazyPage(<Login />)} />
          <Route path="/forgot-password" element={lazyPage(<ForgotPassword />)} />
          <Route path="/reset-password" element={lazyPage(<ResetPassword />)} />

          {/* Protected Routes */}
          <Route element={<ProtectedRoute />}>
            {/* Admin Portal */}
            <Route element={<RoleRoute allowedRoles={['admin']} />}>
              <Route element={<AdminLayout />}>
                <Route path="/admin" element={lazyPage(<AdminDashboard />)} />
              </Route>
            </Route>

            {/* Pharmacist Portal */}
            <Route element={<RoleRoute allowedRoles={['pharmacist']} />}>
              <Route element={<PharmacyLayout />}>
                {pharmacyPages.map(({ path, element, perm }) => (
                  <Route key={path} element={<PermissionRoute perm={perm} />}>
                    <Route path={path} element={lazyPage(element)} />
                  </Route>
                ))}
              </Route>
            </Route>
          </Route>

          {/* Fallback Redirect */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
