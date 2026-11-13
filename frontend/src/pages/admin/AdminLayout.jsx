import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import ChangePasswordModal from './ChangePasswordModal';
import SecurityModal from './SecurityModal';
import TwoFactorNudge from '../../components/settings/TwoFactorNudge';
import AdminSidebar from '../../components/admin/layout/AdminSidebar';
import AdminTopBar from '../../components/admin/layout/AdminTopBar';

const SIDEBAR_COLLAPSED_KEY = 'erp_admin_sidebar_collapsed';

// Platform-admin shell: sidebar + top bar around the routed page. The pieces live in
// components/admin/layout/; this file only owns the shared UI state.
const AdminLayout = () => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  });

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  };

  const handleOpenCreateModal = () => {
    window.dispatchEvent(new CustomEvent('open-create-pharmacy'));
    setMobileOpen(false);
  };

  const handleSyncStats = () => {
    window.dispatchEvent(new CustomEvent('refresh-admin-data'));
    setMobileOpen(false);
  };

  return (
    <div className="flex h-screen supports-[height:100dvh]:h-dvh bg-[#f4f7fa] dark:bg-[#0d1117] text-slate-800 dark:text-slate-100 font-sans overflow-hidden transition-colors duration-200">
      <AdminSidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileOpen}
        onToggleCollapse={toggleSidebarCollapse}
        onCloseMobile={() => setMobileOpen(false)}
        onProvision={handleOpenCreateModal}
        onSyncStats={handleSyncStats}
        onOpenSecurity={() => setSecurityOpen(true)}
        onOpenPassword={() => setPasswordOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <AdminTopBar
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
          onOpenMobile={() => setMobileOpen(true)}
          search={globalSearch}
          onSearchChange={setGlobalSearch}
        />

        {/* Scrollable Page Body with Cool Gray Canvas */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-8">
          <TwoFactorNudge onAction={() => setSecurityOpen(true)} className="mb-6" />
          {/* Keyed by path so a crashed page's fallback resets when the user navigates away. */}
          <ErrorBoundary key={location.pathname}>
            <Outlet context={{ globalSearch }} />
          </ErrorBoundary>
        </main>
        <ChangePasswordModal isOpen={passwordOpen} onClose={() => setPasswordOpen(false)} />
        <SecurityModal isOpen={securityOpen} onClose={() => setSecurityOpen(false)} />
      </div>
    </div>
  );
};

export default AdminLayout;
