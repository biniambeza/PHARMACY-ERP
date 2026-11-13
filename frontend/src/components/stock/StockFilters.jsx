import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Status pills: value, plus the active-state colour classes for each pill.
const PILLS = [
  { value: 'active', labelKey: 'filters.active', activeCls: 'text-emerald-600 dark:text-emerald-400' },
  { value: 'expiring', labelKey: 'filters.expiring', activeCls: 'text-amber-600 dark:text-amber-400' },
  { value: 'depleted', labelKey: 'filters.depleted', activeCls: 'text-slate-800 dark:text-white' },
  { value: '', labelKey: 'filters.all', activeCls: 'text-emerald-600 dark:text-emerald-400' },
];

// Search box and status filter pills for the Stock page.
const StockFilters = ({ search, onSearchChange, statusFilter, onStatusChange }) => {
  const { t } = useTranslation('stock');

  return (
    <div className="bg-white dark:bg-[#161c26] border border-slate-100/90 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
      {/* Search */}
      <div className="relative flex-1 min-w-[240px]">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('page.searchPlaceholder')}
          className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
        />
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-medium">
          {PILLS.map((pill) => (
            <button
              key={pill.value || 'all'}
              onClick={() => onStatusChange(pill.value)}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
                statusFilter === pill.value
                  ? `bg-white dark:bg-[#161c26] ${pill.activeCls} font-bold shadow-2xs`
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t(pill.labelKey)}
            </button>
          ))}
        </div>

        {search && (
          <button
            onClick={() => onSearchChange('')}
            className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition font-medium cursor-pointer"
          >
            {t('common:buttons.clear')}
          </button>
        )}
      </div>
    </div>
  );
};

export default StockFilters;
