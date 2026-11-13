import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './routes/ProtectedRoute';
import RoleRoute from './routes/RoleRoute';
import Login from './pages/auth/Login';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminLayout from './pages/admin/AdminLayout';
import PharmacistDashboard from './pages/pharmacist/Dashboard';
import PharmacyLayout from './pages/pharmacist/PharmacyLayout';
import Medicines from './pages/pharmacist/Medicines';
import Stock from './pages/pharmacist/Stock';
import POS from './pages/pharmacist/POS';
import SalesHistory from './pages/pharmacist/SalesHistory';
import Suppliers from './pages/pharmacist/Suppliers';
import PurchaseOrders from './pages/pharmacist/PurchaseOrders';
import Reports from './pages/pharmacist/Reports';
import Settings from './pages/pharmacist/Settings';
import Staff from './pages/pharmacist/Staff';
import Returns from './pages/pharmacist/Returns';
import Expiry from './pages/pharmacist/Expiry';
import Notifications from './pages/pharmacist/Notifications';
import Customers from './pages/pharmacist/Customers';
import Payables from './pages/pharmacist/Payables';
import Reorder from './pages/pharmacist/Reorder';
import StockTake from './pages/pharmacist/StockTake';
import Movements from './pages/pharmacist/Movements';
import Import from './pages/pharmacist/Import';
import Patients from './pages/pharmacist/Patients';
import ControlledRegister from './pages/pharmacist/ControlledRegister';
import Interactions from './pages/pharmacist/Interactions';
import AuditLog from './pages/pharmacist/AuditLog';
import Transfers from './pages/pharmacist/Transfers';
import Shifts from './pages/pharmacist/Shifts';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import PermissionRoute from './routes/PermissionRoute';

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
  { path: '/pharmacy/reorder', element: <Reorder />, perm: 'po:manage' },
  { path: '/pharmacy/stock-take', element: <StockTake />, perm: 'stock:take' },
  { path: '/pharmacy/movements', element: <Movements />, perm: 'stock:view' },
  { path: '/pharmacy/import', element: <Import />, perm: 'data:import' },
  { path: '/pharmacy/patients', element: <Patients />, perm: 'patient:view' },
  { path: '/pharmacy/controlled', element: <ControlledRegister />, perm: 'controlled:view' },
  { path: '/pharmacy/interactions', element: <Interactions />, perm: 'interaction:manage' },
  { path: '/pharmacy/audit', element: <AuditLog />, perm: 'audit:view' },
  { path: '/pharmacy/transfers', element: <Transfers />, perm: 'transfer:manage' },
  { path: '/pharmacy/shifts', element: <Shifts />, perm: 'shift:own' },
];

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
        <Routes>
          {/* Public Auth Route */}
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Protected Routes */}
          <Route element={<ProtectedRoute />}>
            {/* Admin Portal */}
            <Route element={<RoleRoute allowedRoles={['admin']} />}>
              <Route element={<AdminLayout />}>
                <Route path="/admin" element={<AdminDashboard />} />
              </Route>
            </Route>

            {/* Pharmacist Portal */}
            <Route element={<RoleRoute allowedRoles={['pharmacist']} />}>
              <Route element={<PharmacyLayout />}>
                {pharmacyPages.map(({ path, element, perm }) => (
                  <Route key={path} element={<PermissionRoute perm={perm} />}>
                    <Route path={path} element={element} />
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
