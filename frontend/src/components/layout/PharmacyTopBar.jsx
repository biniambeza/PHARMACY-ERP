import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import NotificationBell from './NotificationBell';
import BranchSwitcher from './BranchSwitcher';
import LanguageSwitcher from '../common/LanguageSwitcher';
import { formatDate } from '../../utils/format';

// Pharmacy top header: sidebar toggles, global search, branch/language switchers, date, notifications, theme and user.
const PharmacyTopBar = ({ user, roleLabel, collapsed, onToggleCollapse, onOpenMobile, globalSearch, onGlobalSearch, isDark, onToggleTheme }) => {
  return (
    <header className="h-20 bg-white dark:bg-[#151a24] border-b border-slate-100 dark:border-slate-800 px-6 sm:px-8 flex items-center justify-between gap-4 shrink-0 z-30 shadow-xs transition-colors">
      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
        {/* Desktop Sidebar Toggle Button */}
        <button
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Minimize sidebar'}
          className="hidden lg:flex p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition cursor-pointer"
        >
          {collapsed ? (
            <PanelLeftOpen className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <PanelLeftClose className="w-5 h-5" />
          )}
        </button>

        {/* Mobile menu trigger */}
        <button
          onClick={onOpenMobile}
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
            onChange={(e) => onGlobalSearch(e.target.value)}
            placeholder="Search medications, invoice numbers, patients or lots..."
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
        {/* Branch switcher (hidden with a single branch) */}
        <BranchSwitcher />

        {/* Language switcher */}
        <LanguageSwitcher />

        {/* Date Pill */}
        <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-full text-xs font-medium text-slate-700 dark:text-slate-300 shadow-2xs">
          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>{formatDate(new Date())}</span>
        </div>

        {/* Notifications (owned by the Notify module) */}
        <NotificationBell />

        {/* Quick Dark/Light Toggle */}
        <button
          onClick={onToggleTheme}
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
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center text-white font-bold text-xs shadow-sm ring-2 ring-slate-100 dark:ring-slate-800">
            {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="hidden lg:block text-left">
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                {user?.name || 'Pharmacist'}
              </span>
              <span className="text-slate-400 text-[10px]">▼</span>
            </div>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold block leading-tight capitalize">
              {roleLabel}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default PharmacyTopBar;
