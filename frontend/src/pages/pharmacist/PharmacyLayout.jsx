import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import { useTheme } from '../../context/useTheme';
import { getMyPharmacy } from '../../api/pharmacyApi';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import { navGroups, quickActions as allQuickActions } from '../../config/navigation';
import { ROLE_LABELS } from '../../config/permissions';
import SidebarBrand from '../../components/layout/SidebarBrand';
import SidebarNav from '../../components/layout/SidebarNav';
import SidebarFooter from '../../components/layout/SidebarFooter';
import PharmacyTopBar from '../../components/layout/PharmacyTopBar';
import AnnouncementBanner from '../../components/announcements/AnnouncementBanner';
import TwoFactorNudge from '../../components/settings/TwoFactorNudge';
import LocaleSync from '../../i18n/LocaleSync';

const PharmacyLayout = () => {
  const { user, logout, can, membershipRole } = useAuth();
  const roleLabel = ROLE_LABELS[membershipRole] || 'Staff';
  const visibleGroups = navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.perm || can(item.perm)) }))
    .filter((group) => group.items.length > 0);
  const quickActions = allQuickActions.filter((action) => !action.perm || can(action.perm));
  const { toggleTheme, isDark } = useTheme();
  const [pharmacy, setPharmacy] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('erp_sidebar_collapsed') === 'true';
  });

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('erp_sidebar_collapsed', String(next));
      return next;
    });
  };

  useEffect(() => {
    const fetchPharmacy = async () => {
      try {
        const res = await getMyPharmacy();
        setPharmacy(res.pharmacy);
      } catch (err) {
        console.error('Failed to load pharmacy profile:', err);
      }
    };
    fetchPharmacy();
  }, []);

  return (
    <div className="flex h-screen bg-[#f4f7fa] dark:bg-[#0d1117] text-slate-800 dark:text-slate-100 font-sans overflow-hidden transition-colors duration-200">
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/50 backdrop-blur-xs z-40 lg:hidden transition-opacity"
        />
      )}

      {/* Left Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-white dark:bg-[#161c26] border-r border-slate-200/80 dark:border-[#262e3f] transition-all duration-300 ease-in-out lg:static ${
          sidebarCollapsed ? 'w-64 lg:w-20' : 'w-64'
        } ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand / Logo Header */}
        <SidebarBrand
          pharmacy={pharmacy}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
          onCloseMobile={() => setMobileOpen(false)}
        />

        {/* Unified Navigation List */}
        <SidebarNav
          visibleGroups={visibleGroups}
          quickActions={quickActions}
          collapsed={sidebarCollapsed}
          onNavigate={() => setMobileOpen(false)}
        />

        {/* Sidebar Footer with Theme Switch & User Bar */}
        <SidebarFooter
          user={user}
          roleLabel={roleLabel}
          collapsed={sidebarCollapsed}
          isDark={isDark}
          onToggleTheme={toggleTheme}
          onLogout={logout}
        />
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Floating Top Header Bar matching reference design */}
        <PharmacyTopBar
          user={user}
          roleLabel={roleLabel}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
          onOpenMobile={() => setMobileOpen(true)}
          globalSearch={globalSearch}
          onGlobalSearch={setGlobalSearch}
          isDark={isDark}
          onToggleTheme={toggleTheme}
        />

        {/* Scrollable Page Body with Cool Gray Canvas */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-8">
          <LocaleSync />
          <AnnouncementBanner />
          <TwoFactorNudge to="/pharmacy/settings" />
          <ErrorBoundary>
            <Outlet context={{ pharmacy, globalSearch }} />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};

export default PharmacyLayout;
