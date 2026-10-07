import { useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import {
  Home,
  PlusCircle,
  RefreshCw,
  Moon,
  Sun,
  LogOut,
  X,
  Search,
  Bell,
  Menu,
} from 'lucide-react';

const adminNavItems = [
  { name: 'Command Center', to: '/admin', end: true, icon: Home, badge: 'Hub' },
];

const AdminLayout = () => {
  const { user, logout } = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const navigate = useNavigate();

  const handleOpenCreateModal = () => {
    window.dispatchEvent(new CustomEvent('open-create-pharmacy'));
    setMobileOpen(false);
  };

  const handleSyncStats = () => {
    window.dispatchEvent(new CustomEvent('refresh-admin-data'));
    setMobileOpen(false);
  };

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
        className={`fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-white dark:bg-[#161c26] border-r border-slate-200/80 dark:border-[#262e3f] transition-all duration-300 ease-in-out lg:static ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand / Logo Header */}
        <div className="h-20 px-6 flex items-center justify-between border-b border-slate-200/80 dark:border-[#262e3f] shrink-0 bg-white dark:bg-[#161c26]">
          <Link to="/admin" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white font-extrabold text-lg shadow-md shadow-emerald-500/25">
              AD
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight truncate max-w-[130px]">
                Admin Portal
              </h1>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold truncate">
                Global Command Center
              </p>
            </div>
          </Link>

          {/* Mobile Close Button */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Unified Navigation List */}
        <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-4 custom-scrollbar">
          <div className="space-y-1">
            {adminNavItems.map((item) => {
              const IconComponent = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs sm:text-[13px] transition-all duration-150 ${
                      isActive
                        ? 'bg-emerald-50/90 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 font-semibold shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/60 font-medium'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive ? (
                        <span className="w-7 h-7 rounded-lg bg-emerald-600 dark:bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-2xs shadow-emerald-500/20">
                          <IconComponent className="w-4 h-4" />
                        </span>
                      ) : (
                        <span className="w-7 h-7 flex items-center justify-center shrink-0 text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
                          <IconComponent className="w-4.5 h-4.5" />
                        </span>
                      )}
                      <span className="flex-1 truncate">{item.name}</span>
                      {item.badge && (
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            isActive
                              ? 'bg-emerald-100/90 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>

          {/* Quick Actions Shortcuts */}
          <div className="pt-3 pb-1 border-t border-slate-100 dark:border-slate-800/80">
            <div className="px-3 pb-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 tracking-tight">
              Quick Actions
            </div>
            <div className="space-y-1.5">
              <button
                onClick={handleOpenCreateModal}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200/90 hover:border-slate-300 dark:text-slate-300 dark:bg-[#1a2230]/70 dark:hover:bg-[#222c3e] dark:hover:text-white dark:border-slate-800 rounded-xl transition shadow-2xs cursor-pointer text-left group"
              >
                <span className="w-6 h-6 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-center shrink-0 text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition">
                  <PlusCircle className="w-3.5 h-3.5" />
                </span>
                <span className="truncate">Provision Pharmacy</span>
              </button>
              <button
                onClick={handleSyncStats}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200/90 hover:border-slate-300 dark:text-slate-300 dark:bg-[#1a2230]/70 dark:hover:bg-[#222c3e] dark:hover:text-white dark:border-slate-800 rounded-xl transition shadow-2xs cursor-pointer text-left group"
              >
                <span className="w-6 h-6 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-center shrink-0 text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition">
                  <RefreshCw className="w-3.5 h-3.5" />
                </span>
                <span className="truncate">Sync Platform Stats</span>
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar Footer with Dark/Light Switch & Profile */}
        <div className="p-3 border-t border-slate-200/80 dark:border-[#262e3f] bg-white dark:bg-[#161c26] shrink-0 space-y-2">
          {/* Light / Dark Mode Toggle Pill */}
          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-slate-700 dark:bg-[#1f2635] dark:border-[#2b3548] dark:text-slate-200 transition cursor-pointer shadow-2xs"
          >
            <div className="flex items-center gap-2">
              {isDark ? (
                <Moon className="w-4 h-4 text-emerald-400" />
              ) : (
                <Sun className="w-4 h-4 text-amber-500" />
              )}
              <span>{isDark ? 'Dark Mode' : 'Light Mode'}</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white dark:bg-[#161c26] text-slate-500 dark:text-slate-400 font-mono border border-slate-200/60 dark:border-slate-700/60">
              Toggle
            </span>
          </button>

          {/* User Profile Mini Bar */}
          <div className="flex items-center justify-between px-1.5 py-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'A'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {user?.name || 'Administrator'}
                </p>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 capitalize truncate font-semibold">
                  {user?.role || 'Super Admin'}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              title="Sign Out"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-500/10 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Floating Top Header Bar */}
        <header className="h-20 bg-white dark:bg-[#151a24] border-b border-slate-100 dark:border-slate-800 px-6 sm:px-8 flex items-center justify-between gap-4 shrink-0 z-30 shadow-xs transition-colors">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            {/* Mobile menu trigger */}
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Global Search Bar with Rounded Pill */}
            <div className="relative max-w-md w-full hidden md:block">
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search tenant pharmacies, license IDs, owners, or emails..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-full text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              />
              <svg
                className="w-4 h-4 text-slate-400 absolute left-3 top-2.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            {/* Date Pill */}
            <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-full text-xs font-medium text-slate-700 dark:text-slate-300 shadow-2xs">
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>

            {/* Notification Bell */}
            <button
              title="Notifications"
              className="relative p-2 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
            </button>

            {/* Quick Dark/Light Toggle */}
            <button
              onClick={toggleTheme}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="p-2 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                {isDark ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                )}
              </svg>
            </button>

            {/* User Profile Dropdown Pill */}
            <div className="flex items-center gap-3 pl-2 sm:pl-3 border-l border-slate-200 dark:border-slate-800">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white font-bold text-xs shadow-sm ring-2 ring-slate-100 dark:ring-slate-800">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'A'}
              </div>
              <div className="hidden lg:block text-left">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                    {user?.name || 'Administrator'}
                  </span>
                  <span className="text-slate-400 text-[10px]">▼</span>
                </div>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold block leading-tight capitalize">
                  {user?.role || 'Super Admin'}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Page Body with Cool Gray Canvas */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-8">
          <ErrorBoundary>
            <Outlet context={{ globalSearch }} />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
