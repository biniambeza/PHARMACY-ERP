import { Search, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const RX_TABS = [
  { value: 'all', key: 'filters.allTypes', active: 'text-emerald-600 dark:text-emerald-400' },
  { value: 'rx', key: 'filters.rxOnly', active: 'text-amber-600 dark:text-amber-400' },
  { value: 'otc', key: 'filters.otc', active: 'text-emerald-600 dark:text-emerald-400' },
];

// Search / Rx-OTC tabs / category / margin-warning toolbar for the medicine catalog.
const MedicineFilters = ({
  search,
  setSearch,
  rxFilter,
  setRxFilter,
  selectedCategory,
  setSelectedCategory,
  categories,
  marginWarningCount,
  marginOnly,
  setMarginOnly,
}) => {
  const { t } = useTranslation('medicines');

  return (
    <div className="bg-white dark:bg-[#161c26] border border-slate-100/90 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
      {/* Search Input */}
      <div className="relative flex-1 min-w-[240px]">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('filters.searchPlaceholder')}
          className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
        />
      </div>

      {/* Categories and Filters */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Rx Filter Tabs */}
        <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-medium">
          {RX_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setRxFilter(tab.value)}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
                rxFilter === tab.value
                  ? `bg-white dark:bg-[#161c26] ${tab.active} font-bold shadow-2xs`
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t(tab.key)}
            </button>
          ))}
        </div>

        {/* Category Dropdown */}
        <div className="flex items-center gap-2">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition cursor-pointer"
          >
            <option value="">{t('filters.allCategories')}</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {marginWarningCount > 0 && (
            <button
              onClick={() => setMarginOnly((v) => !v)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                marginOnly
                  ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                  : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/60'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              {t('filters.marginWarnings', { count: marginWarningCount })}
            </button>
          )}

          {(search || selectedCategory || rxFilter !== 'all' || marginOnly) && (
            <button
              onClick={() => {
                setSearch('');
                setSelectedCategory('');
                setRxFilter('all');
                setMarginOnly(false);
              }}
              className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition font-medium cursor-pointer"
            >
              {t('common:buttons.reset')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MedicineFilters;
