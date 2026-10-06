import { useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const adminNavGroups = [
  {
    header: 'GENERAL',
    items: [
      {
        name: 'Command Center',
        to: '/admin',
        end: true,
        badge: 'Hub',
        icon: (
          <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        ),
      },
    ],
  },
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

  return (
    <div className="flex h-screen bg-[#f4f7fa] dark:bg-[#0d1117] text-slate-800 dark:text-slate-100 font-sans overflow-hidden transition-colors duration-200">
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/50 backdrop-blur-xs z-40 lg:hidden transition-opacity"
        />
      )}

      {/* Left Sidebar (Dark Executive Theme: bg-[#1c222f]) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-[#1c222f] border-r border-[#262e3f] transition-all duration-300 ease-in-out lg:static ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand / Logo Header */}
        <div className="h-20 px-6 flex items-center justify-between border-b border-[#262e3f] shrink-0 bg-[#171c26]">
          <Link to="/admin" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-500 to-cyan-500 flex items-center justify-center text-white font-extrabold text-lg shadow-md shadow-teal-500/25">
              AD
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-white tracking-tight truncate max-w-[130px]">
                Admin Portal
              </h1>
              <p className="text-[11px] text-teal-400 font-medium truncate">
                Global Command Center
              </p>
            </div>
          </Link>

          {/* Mobile Close Button */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Categorized Navigation with Section Headers */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar">
          {adminNavGroups.map((group) => (
            <div key={group.header} className="space-y-1">
              <div className="px-3 pb-1 text-[11px] font-bold text-slate-500 tracking-wider">
                {group.header}
              </div>

              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-teal-500/15 text-teal-300 font-semibold border-l-2 border-teal-400 shadow-2xs'
                        : 'text-slate-400 hover:text-white hover:bg-[#252c3c]'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`transition-colors shrink-0 ${
                          isActive ? 'text-teal-400' : 'text-slate-400'
                        }`}
                      >
                        {item.icon}
                      </span>
                      <span className="flex-1 truncate">{item.name}</span>
                      {item.badge && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}

          {/* Quick Actions Card */}
          <div className="pt-2 pb-1 border-t border-[#262e3f]">
            <div className="px-3 pb-2 text-[11px] font-bold text-slate-500 tracking-wider">
              TENANT CONTROLS
            </div>
            <div className="space-y-1.5">
              <button
                onClick={handleOpenCreateModal}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-300 bg-[#252c3c]/60 hover:bg-[#2b3446] hover:text-white border border-[#2b3446] rounded-xl transition cursor-pointer text-left"
              >
                <svg className="w-3.5 h-3.5 text-teal-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span className="truncate">Provision New Pharmacy</span>
              </button>
              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('refresh-admin-data'));
                  setMobileOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-300 bg-[#252c3c]/60 hover:bg-[#2b3446] hover:text-white border border-[#2b3446] rounded-xl transition cursor-pointer text-left"
              >
                <svg className="w-3.5 h-3.5 text-cyan-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="truncate">Sync Platform Stats</span>
              </button>
            </div>
          </div>

          {/* Security & Multi-Tenant Status Badge */}
          <div className="p-3 bg-[#171c26] border border-[#262e3f] rounded-xl text-xs space-y-1">
            <div className="flex items-center gap-2 text-teal-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
              <span>Multi-Tenant Engine</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Real-time tenant data isolation active via strict query partitioning.
            </p>
          </div>
        </div>

        {/* Sidebar Footer with Dark/Light Switch & Profile */}
        <div className="p-3 border-t border-[#262e3f] bg-[#171c26] shrink-0 space-y-2">
          {/* Light / Dark Mode Toggle Pill */}
          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold bg-[#252c3c] border border-[#2e3749] text-slate-200 hover:border-teal-400/60 transition cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                {isDark ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                )}
              </svg>
              <span>{isDark ? 'Dark Mode' : 'Light Mode'}</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1c222f] text-slate-400 font-mono">
              Toggle
            </span>
          </button>

          {/* User Profile Mini Bar */}
          <div className="flex items-center justify-between px-2 py-1.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-teal-500 to-cyan-500 text-white font-bold text-xs flex items-center justify-center shrink-0">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'A'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">
                  {user?.name || 'Administrator'}
                </p>
                <p className="text-[10px] text-teal-400 capitalize truncate">
                  {user?.role || 'Super Admin'}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              title="Sign Out"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
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
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-full text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition"
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
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-teal-500 ring-2 ring-white dark:ring-slate-900" />
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
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-teal-500 to-cyan-500 flex items-center justify-center text-white font-bold text-xs shadow-sm ring-2 ring-slate-100 dark:ring-slate-800">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'A'}
              </div>
              <div className="hidden lg:block text-left">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                    {user?.name || 'Administrator'}
                  </span>
                  <span className="text-slate-400 text-[10px]">▼</span>
                </div>
                <span className="text-[11px] text-teal-600 dark:text-teal-400 font-semibold block leading-tight capitalize">
                  {user?.role || 'Super Admin'}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Page Body with Cool Gray Canvas */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-8">
          <Outlet context={{ globalSearch }} />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
