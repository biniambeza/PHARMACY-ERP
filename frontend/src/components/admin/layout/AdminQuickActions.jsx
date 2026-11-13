import { useTranslation } from 'react-i18next';
import { PlusCircle, RefreshCw } from 'lucide-react';

// Sidebar shortcuts: provision a pharmacy and refresh platform stats.
const AdminQuickActions = ({ collapsed, onProvision, onSyncStats }) => {
  const { t } = useTranslation('admin');
  return (
    <div className={`pt-3 pb-1 border-t border-slate-100 dark:border-slate-800/80 ${collapsed ? 'flex flex-col items-center' : ''}`}>
      {!collapsed ? (
        <>
          <div className="px-3 pb-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 tracking-tight">
            {t('layout.quickActions')}
          </div>
          <div className="space-y-1.5">
            <button
              onClick={onProvision}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200/90 hover:border-slate-300 dark:text-slate-300 dark:bg-[#1a2230]/70 dark:hover:bg-[#222c3e] dark:hover:text-white dark:border-slate-800 rounded-xl transition shadow-2xs cursor-pointer text-left group"
            >
              <span className="w-6 h-6 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-center shrink-0 text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition">
                <PlusCircle className="w-3.5 h-3.5" />
              </span>
              <span className="truncate">{t('layout.provisionPharmacy')}</span>
            </button>
            <button
              onClick={onSyncStats}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200/90 hover:border-slate-300 dark:text-slate-300 dark:bg-[#1a2230]/70 dark:hover:bg-[#222c3e] dark:hover:text-white dark:border-slate-800 rounded-xl transition shadow-2xs cursor-pointer text-left group"
            >
              <span className="w-6 h-6 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-center shrink-0 text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition">
                <RefreshCw className="w-3.5 h-3.5" />
              </span>
              <span className="truncate">{t('layout.syncStats')}</span>
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-1.5 w-full flex flex-col items-center">
          <button
            onClick={onProvision}
            title={t('layout.provisionPharmacy')}
            className="group relative w-10 h-10 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-[#1a2230]/70 dark:hover:bg-[#222c3e] border border-slate-200/70 dark:border-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition cursor-pointer shadow-2xs"
          >
            <PlusCircle className="w-4 h-4" />
            <div className="hidden lg:flex absolute left-full ml-3 px-2.5 py-1 bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 pointer-events-none whitespace-nowrap z-50 border border-slate-700/60">
              {t('layout.provisionPharmacy')}
            </div>
          </button>
          <button
            onClick={onSyncStats}
            title={t('layout.syncStats')}
            className="group relative w-10 h-10 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-[#1a2230]/70 dark:hover:bg-[#222c3e] border border-slate-200/70 dark:border-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition cursor-pointer shadow-2xs"
          >
            <RefreshCw className="w-4 h-4" />
            <div className="hidden lg:flex absolute left-full ml-3 px-2.5 py-1 bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 pointer-events-none whitespace-nowrap z-50 border border-slate-700/60">
              {t('layout.syncStats')}
            </div>
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminQuickActions;
