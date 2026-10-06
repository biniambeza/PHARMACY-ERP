import { useState, useEffect } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { getMyPharmacy } from '../../api/pharmacyApi';

const navGroups = [
  {
    header: 'GENERAL',
    items: [
      {
        name: 'Overview',
        to: '/pharmacy',
        end: true,
        icon: (
          <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        ),
      },
    ],
  },
  {
    header: 'DISPENSARY',
    items: [
      {
        name: 'Point of Sale',
        to: '/pharmacy/pos',
        end: false,
        badge: 'Cashier',
        icon: (
          <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        ),
      },
      {
        name: 'Sales Ledger',
        to: '/pharmacy/sales',
        end: false,
        icon: (
          <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
    ],
  },
  {
    header: 'INVENTORY',
    items: [
      {
        name: 'Stock & Batches',
        to: '/pharmacy/stock',
        end: false,
        badge: 'FEFO',
        icon: (
          <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        ),
      },
      {
        name: 'Medicine Catalog',
        to: '/pharmacy/medicines',
        end: false,
        icon: (
          <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
        ),
      },
    ],
  },
  {
    header: 'SUPPLY CHAIN',
    items: [
      {
        name: 'Procurement (POs)',
        to: '/pharmacy/procurement',
        end: false,
        icon: (
          <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        ),
      },
      {
        name: 'Suppliers',
        to: '/pharmacy/suppliers',
        end: false,
        icon: (
          <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        ),
      },
    ],
  },
  {
    header: 'INTELLIGENCE',
    items: [
      {
        name: 'Financial Reports',
        to: '/pharmacy/reports',
        end: false,
        icon: (
          <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
      },
    ],
  },
  {
    header: 'MANAGEMENT',
    items: [
      {
        name: 'Settings',
        to: '/pharmacy/settings',
        end: false,
        icon: (
          <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
      },
    ],
  },
];

const PharmacyLayout = () => {
  const { user, logout } = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const [pharmacy, setPharmacy] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const navigate = useNavigate();

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

      {/* Left Sidebar (Dark Executive Theme: bg-[#1c222f]) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-[#1c222f] border-r border-[#262e3f] transition-all duration-300 ease-in-out lg:static ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand / Logo Header */}
        <div className="h-20 px-6 flex items-center justify-between border-b border-[#262e3f] shrink-0 bg-[#171c26]">
          <Link to="/pharmacy" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-500 to-cyan-500 flex items-center justify-center text-white font-extrabold text-lg shadow-md shadow-teal-500/25">
              Rx
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-white tracking-tight truncate max-w-[130px]">
                {pharmacy ? pharmacy.name : 'Pharmacy ERP'}
              </h1>
              <p className="text-[11px] text-teal-400 font-medium truncate">
                Dispensary Portal
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
          {navGroups.map((group) => (
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

          {/* Quick Actions Shortcuts */}
          <div className="pt-2 pb-1 border-t border-[#262e3f]">
            <div className="px-3 pb-2 text-[11px] font-bold text-slate-500 tracking-wider">
              QUICK LAUNCH
            </div>
            <div className="space-y-1.5">
              <button
                onClick={() => navigate('/pharmacy/pos')}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-300 bg-[#252c3c]/60 hover:bg-[#2b3446] hover:text-white border border-[#2b3446] rounded-xl transition cursor-pointer text-left"
              >
                <span className="text-teal-400">🛒</span>
                <span className="truncate">New Sale (POS)</span>
              </button>
              <button
                onClick={() => navigate('/pharmacy/stock')}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-300 bg-[#252c3c]/60 hover:bg-[#2b3446] hover:text-white border border-[#2b3446] rounded-xl transition cursor-pointer text-left"
              >
                <span className="text-cyan-400">📦</span>
                <span className="truncate">Receive Lot (Stock)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar Footer with Theme Switch & User Bar */}
        <div className="p-3 border-t border-[#262e3f] bg-[#171c26] shrink-0 space-y-2">
          {/* Light / Dark Mode Toggle Button */}
          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold bg-[#252c3c] border border-[#2e3749] text-slate-200 hover:border-teal-400/60 transition cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span>{isDark ? '🌙' : '☀️'}</span>
              <span>{isDark ? 'Dark Mode' : 'Light Mode'}</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1c222f] text-slate-400 font-mono">
              Toggle
            </span>
          </button>

          {/* User Profile Info Chip */}
          <div className="flex items-center justify-between px-2 py-1.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-teal-500 to-cyan-500 text-white font-bold text-xs flex items-center justify-center shrink-0">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'P'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">
                  {user?.name || 'Pharmacist'}
                </p>
                <p className="text-[10px] text-teal-400 capitalize truncate">
                  {user?.role || 'Pharmacist'}
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
        {/* Floating Top Header Bar matching reference design */}
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
                placeholder="Search medications, invoice numbers, patients or lots..."
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
              <span>📅</span>
              <span>{new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>

            {/* Notification Bell with Badge */}
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
              {isDark ? '🌙' : '☀️'}
            </button>

            {/* User Profile Dropdown Pill */}
            <div className="flex items-center gap-3 pl-2 sm:pl-3 border-l border-slate-200 dark:border-slate-800">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-teal-500 to-cyan-500 flex items-center justify-center text-white font-bold text-xs shadow-sm ring-2 ring-slate-100 dark:ring-slate-800">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="hidden lg:block text-left">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                    {user?.name || 'Pharmacist'}
                  </span>
                  <span className="text-slate-400 text-[10px]">▼</span>
                </div>
                <span className="text-[11px] text-teal-600 dark:text-teal-400 font-semibold block leading-tight capitalize">
                  {user?.role || 'Staff'}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Page Body with Cool Gray Canvas */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-8">
          <Outlet context={{ pharmacy, globalSearch }} />
        </main>
      </div>
    </div>
  );
};

export default PharmacyLayout;
