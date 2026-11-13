import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

// Admin sidebar header: logo, portal title and collapse/close buttons.
const AdminSidebarBrand = ({ collapsed, onToggleCollapse, onCloseMobile }) => {
  const { t } = useTranslation('admin');
  return (
    <div
      className={`h-20 ${
        collapsed ? 'px-3 justify-center' : 'px-5 justify-between'
      } flex items-center border-b border-slate-200/80 dark:border-[#262e3f] shrink-0 bg-white dark:bg-[#161c26] relative transition-all duration-200`}
    >
      {!collapsed ? (
        <>
          <Link to="/admin" className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center text-white font-extrabold text-lg shadow-md shadow-emerald-500/25 shrink-0">
              AD
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight truncate max-w-[115px]">
                {t('layout.portalTitle')}
              </h1>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold truncate">
                {t('layout.portalSubtitle')}
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-1">
            {/* Desktop Collapse Toggle */}
            <button
              onClick={onToggleCollapse}
              title={t('layout.minimizeSidebar')}
              className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 transition cursor-pointer"
            >
              <ChevronLeft className="w-4.5 h-4.5" />
            </button>
            {/* Mobile Close Button */}
            <button
              onClick={onCloseMobile}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center relative w-full">
          <Link to="/admin" title={t('layout.commandCenterTitle')} className="group flex items-center justify-center">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center text-white font-extrabold text-lg shadow-md shadow-emerald-500/25 group-hover:scale-105 transition-transform">
              AD
            </div>
          </Link>
          {/* Expand Toggle floating button on border */}
          <button
            onClick={onToggleCollapse}
            title={t('layout.expandSidebar')}
            className="hidden lg:flex absolute -right-6 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white dark:bg-[#161c26] border border-slate-200 dark:border-slate-700 shadow-md items-center justify-center text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 transition cursor-pointer z-50 hover:scale-110"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminSidebarBrand;
