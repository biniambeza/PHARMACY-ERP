import { useTranslation } from 'react-i18next';

const DASH_RANGES = ['today', '7d', 'monthly', 'yearly'];

const exportBtnCls =
  'inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-[11px] font-semibold rounded-xl transition cursor-pointer disabled:opacity-50';

const DownloadIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
);

/** Range selector + CSV / PDF / Excel export buttons above the KPI cards. */
const DashboardToolbar = ({ range, onRangeChange, onExportCSV, onExportPDF, canExportSales, exportingSales, onExportSalesXlsx }) => {
  const { t } = useTranslation('dashboard');
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-medium self-start">
        {DASH_RANGES.map((id) => (
          <button
            key={id}
            onClick={() => onRangeChange(id)}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
              range === id
                ? 'bg-white dark:bg-[#161c26] text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t(`ranges.${id}`)}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onExportCSV} className={exportBtnCls}>
          <DownloadIcon />
          {t('export.csv')}
        </button>
        <button onClick={onExportPDF} className={exportBtnCls}>
          <DownloadIcon />
          {t('export.pdf')}
        </button>
        {canExportSales && (
          <button onClick={onExportSalesXlsx} disabled={exportingSales} className={exportBtnCls}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" /></svg>
            {exportingSales ? t('export.exporting') : t('export.salesExcel')}
          </button>
        )}
      </div>
    </div>
  );
};

export default DashboardToolbar;
