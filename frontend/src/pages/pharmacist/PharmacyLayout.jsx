import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getMyPharmacy } from '../../api/pharmacyApi';

const navSections = [
  {
    group: 'Clinical & Desk',
    items: [
      {
        name: 'Dashboard',
        to: '/pharmacy',
        end: true,
        badge: null,
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        ),
      },
      {
        name: 'Point of Sale (POS)',
        to: '/pharmacy/pos',
        end: false,
        badge: 'Cashier',
        badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        ),
      },
    ],
  },
  {
    group: 'Pharmacy Inventory',
    items: [
      {
        name: 'Medicines Catalog',
        to: '/pharmacy/medicines',
        end: false,
        badge: null,
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
        ),
      },
      {
        name: 'Stock & Batches',
        to: '/pharmacy/stock',
        end: false,
        badge: 'FEFO',
        badgeColor: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        ),
      },
    ],
  },
  {
    group: 'Procurement & Supply',
    items: [
      {
        name: 'Purchase Orders',
        to: '/pharmacy/procurement',
        end: false,
        badge: null,
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
        ),
      },
      {
        name: 'Suppliers Directory',
        to: '/pharmacy/suppliers',
        end: false,
        badge: null,
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        ),
      },
    ],
  },
  {
    group: 'Finance & Analytics',
    items: [
      {
        name: 'Sales & Invoices',
        to: '/pharmacy/sales',
        end: false,
        badge: null,
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z" />
          </svg>
        ),
      },
      {
        name: 'Financial Reports',
        to: '/pharmacy/reports',
        end: false,
        badge: 'BI',
        badgeColor: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
      },
    ],
  },
  {
    group: 'Configuration',
    items: [
      {
        name: 'Pharmacy Settings',
        to: '/pharmacy/settings',
        end: false,
        badge: null,
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
      },
    ],
  },
];

const PharmacyLayout = () => {
  const { user, logout } = useAuth();
  const [pharmacy, setPharmacy] = useState(null);
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('pharmacy_sidebar_collapsed') === 'true';
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const location = useLocation();
  const navigate = useNavigate();

  // Keep live time clock ticking
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch pharmacy profile
  useEffect(() => {
    const fetchPharmacy = async () => {
      try {
        const res = await getMyPharmacy();
        setPharmacy(res.pharmacy);
      } catch (err) {
        console.error('Failed to load pharmacy profile in layout:', err);
      }
    };
    fetchPharmacy();
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('pharmacy_sidebar_collapsed', String(next));
      return next;
    });
  };

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Current page title mapping
  const getCurrentPageTitle = () => {
    for (const sec of navSections) {
      for (const it of sec.items) {
        if (it.end && location.pathname === it.to) return it.name;
        if (!it.end && location.pathname.startsWith(it.to)) return it.name;
      }
    }
    return 'Pharmacy Workspace';
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans selection:bg-emerald-500 selection:text-white">
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-40 lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-slate-900 border-r border-slate-800 transition-all duration-300 ease-in-out lg:static ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${collapsed ? 'w-20' : 'w-72'}`}
      >
        {/* Brand / Pharmacy Header */}
        <div className="h-18 px-4 flex items-center justify-between border-b border-slate-800 bg-slate-900/90 shrink-0">
          <Link to="/pharmacy" className="flex items-center gap-3 overflow-hidden group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white font-extrabold text-lg shadow-lg shadow-emerald-500/20 shrink-0 group-hover:scale-105 transition-transform">
              Rx
            </div>
            {!collapsed && (
              <div className="overflow-hidden min-w-0">
                <h1 className="text-sm font-bold text-white tracking-tight truncate leading-tight group-hover:text-emerald-400 transition-colors">
                  {pharmacy ? pharmacy.name : 'Pharmacy ERP'}
                </h1>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <p className="text-[10px] text-slate-400 font-mono truncate">
                    {pharmacy?.licenseNo ? `Lic: ${pharmacy.licenseNo}` : 'Enterprise Edition'}
                  </p>
                </div>
              </div>
            )}
          </Link>

          {/* Desktop collapse toggle button */}
          <button
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            className="hidden lg:flex w-7 h-7 rounded-lg items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>

          {/* Mobile close button */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Quick Action Button in Sidebar */}
        <div className="p-3 border-b border-slate-800/60 shrink-0">
          <Link
            to="/pharmacy/pos"
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs shadow-md shadow-emerald-900/40 transition group cursor-pointer ${
              collapsed ? 'w-10 h-10 p-0 mx-auto' : 'w-full'
            }`}
            title="Launch POS Register"
          >
            <svg className="w-4 h-4 shrink-0 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            {!collapsed && <span>New Sale (POS)</span>}
          </Link>
        </div>

        {/* Navigation Menu List */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 custom-scrollbar">
          {navSections.map((section, idx) => (
            <div key={idx} className="space-y-1">
              {!collapsed && (
                <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {section.group}
                </div>
              )}
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  title={collapsed ? item.name : undefined}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all group cursor-pointer relative ${
                      isActive
                        ? 'bg-emerald-500/15 text-emerald-300 font-semibold shadow-sm border border-emerald-500/25 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:bg-emerald-400 before:rounded-r'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70 border border-transparent'
                    } ${collapsed ? 'justify-center px-0' : ''}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className={`shrink-0 transition-colors ${isActive ? 'text-emerald-400' : 'text-slate-400 group-hover:text-slate-200'}`}>
                        {item.icon}
                      </span>
                      {!collapsed && (
                        <div className="flex items-center justify-between flex-1 min-w-0">
                          <span className="truncate">{item.name}</span>
                          {item.badge && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border tracking-wider uppercase ml-2 shrink-0 ${item.badgeColor || 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                              {item.badge}
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </div>

        {/* Pharmacist Profile & Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-900/90 shrink-0">
          <div className={`flex items-center gap-3 p-2 rounded-xl bg-slate-800/60 border border-slate-700/60 ${collapsed ? 'justify-center p-1.5' : ''}`}>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-xs shrink-0">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'P'}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate leading-tight">{user?.name || 'Pharmacist'}</p>
                <p className="text-[10px] text-slate-400 truncate">{user?.email || 'pharmacy@erp.com'}</p>
              </div>
            )}
            {!collapsed && (
              <button
                onClick={logout}
                title="Sign Out"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            )}
          </div>
          {collapsed && (
            <button
              onClick={logout}
              title="Sign Out"
              className="mt-2 w-full h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-950">
        {/* Top Navbar Header */}
        <header className="h-18 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Hamburger Button */}
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Breadcrumb & Section Name */}
            <div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <Link to="/pharmacy" className="hover:text-emerald-400 transition-colors">
                  {pharmacy?.name || 'Pharmacy ERP'}
                </Link>
                <span>/</span>
                <span className="text-slate-300 font-medium">{getCurrentPageTitle()}</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
                {getCurrentPageTitle()}
              </h2>
            </div>
          </div>

          {/* Right Header Status, Time & Quick Links */}
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            {/* Digital Clock */}
            <div className="hidden md:flex flex-col text-right pr-3 border-r border-slate-800">
              <span className="text-xs font-mono font-semibold text-slate-200">
                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className="text-[10px] text-slate-500 font-medium">
                {currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>

            {/* Pharmacy License Pill */}
            {pharmacy?.licenseNo && (
              <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>Rx Lic: {pharmacy.licenseNo}</span>
              </div>
            )}

            {/* Direct Quick POS shortcut */}
            {location.pathname !== '/pharmacy/pos' && (
              <button
                onClick={() => navigate('/pharmacy/pos')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
              >
                <span>⚡</span>
                <span className="hidden sm:inline">Open</span> POS
              </button>
            )}

            {/* User Avatar Circle */}
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 font-bold text-xs">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
          </div>
        </header>

        {/* Page Content Outlet Container */}
        <main className="flex-1 overflow-y-auto bg-slate-900/60 custom-scrollbar">
          <Outlet context={{ pharmacy }} />
        </main>
      </div>
    </div>
  );
};

export default PharmacyLayout;
