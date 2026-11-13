import AdminSidebarBrand from './AdminSidebarBrand';
import AdminSidebarNav from './AdminSidebarNav';
import AdminSidebarFooter from './AdminSidebarFooter';

// Admin sidebar: a static column on desktop (optionally collapsed to icons) and an
// off-canvas drawer with a backdrop on mobile.
const AdminSidebar = ({
  collapsed,
  mobileOpen,
  onToggleCollapse,
  onCloseMobile,
  onProvision,
  onSyncStats,
  onOpenSecurity,
  onOpenPassword,
}) => (
  <>
    {/* Mobile Backdrop */}
    {mobileOpen && (
      <div
        onClick={onCloseMobile}
        className="fixed inset-0 bg-black/50 backdrop-blur-xs z-40 lg:hidden transition-opacity"
      />
    )}

    <aside
      className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-white dark:bg-[#161c26] border-r border-slate-200/80 dark:border-[#262e3f] transition-all duration-300 ease-in-out lg:static ${
        collapsed ? 'w-64 lg:w-20' : 'w-64'
      } ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}
    >
      <AdminSidebarBrand collapsed={collapsed} onToggleCollapse={onToggleCollapse} onCloseMobile={onCloseMobile} />
      <AdminSidebarNav
        collapsed={collapsed}
        onCloseMobile={onCloseMobile}
        onProvision={onProvision}
        onSyncStats={onSyncStats}
      />
      <AdminSidebarFooter collapsed={collapsed} onOpenSecurity={onOpenSecurity} onOpenPassword={onOpenPassword} />
    </aside>
  </>
);

export default AdminSidebar;
