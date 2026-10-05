import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './routes/ProtectedRoute';
import RoleRoute from './routes/RoleRoute';
import Login from './pages/auth/Login';
import AdminDashboard from './pages/admin/AdminDashboard';
import PharmacistDashboard from './pages/pharmacist/Dashboard';
import Medicines from './pages/pharmacist/Medicines';
import Stock from './pages/pharmacist/Stock';
import POS from './pages/pharmacist/POS';
import SalesHistory from './pages/pharmacist/SalesHistory';
import Suppliers from './pages/pharmacist/Suppliers';
import PurchaseOrders from './pages/pharmacist/PurchaseOrders';
import Reports from './pages/pharmacist/Reports';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Auth Route */}
          <Route path="/login" element={<Login />} />

          {/* Protected Routes */}
          <Route element={<ProtectedRoute />}>
            {/* Admin Portal */}
            <Route element={<RoleRoute allowedRoles={['admin']} />}>
              <Route path="/admin" element={<AdminDashboard />} />
            </Route>

            {/* Pharmacist Portal */}
            <Route element={<RoleRoute allowedRoles={['pharmacist']} />}>
              <Route path="/pharmacy" element={<PharmacistDashboard />} />
              <Route path="/pharmacy/medicines" element={<Medicines />} />
              <Route path="/pharmacy/stock" element={<Stock />} />
              <Route path="/pharmacy/pos" element={<POS />} />
              <Route path="/pharmacy/sales" element={<SalesHistory />} />
              <Route path="/pharmacy/suppliers" element={<Suppliers />} />
              <Route path="/pharmacy/procurement" element={<PurchaseOrders />} />
              <Route path="/pharmacy/reports" element={<Reports />} />
            </Route>
          </Route>

          {/* Fallback Redirect */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
