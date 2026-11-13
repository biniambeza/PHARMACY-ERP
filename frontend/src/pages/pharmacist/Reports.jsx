import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, Percent, Download, FileDown, FileSpreadsheet, Users, Archive, CalendarX, Landmark, GitCompare } from 'lucide-react';
import { downloadExport } from '../../api/exportApi';
import { useAuth } from '../../context/useAuth';
import { exportCSV, exportPDF } from '../../utils/export';
import { btn, todayIso, daysAgoIso, fileSlug } from '../../components/reports/reportUtils';
import { Empty } from '../../components/reports/ReportUi';
import OverviewTab from '../../components/reports/OverviewTab';
import ProfitTab from '../../components/reports/ProfitTab';
import StaffTab from '../../components/reports/StaffTab';
import SlowTab from '../../components/reports/SlowTab';
import ExpiryTab from '../../components/reports/ExpiryTab';
import TaxTab from '../../components/reports/TaxTab';
import CompareTab from '../../components/reports/CompareTab';
import EthiopianDateHint from '../../components/common/EthiopianDateHint';

const TABS = [
  { id: 'overview', icon: BarChart3 },
  { id: 'profit', icon: Percent },
  { id: 'staff', icon: Users },
  { id: 'slow', icon: Archive },
  { id: 'expiry', icon: CalendarX },
  { id: 'tax', icon: Landmark },
  { id: 'compare', icon: GitCompare },
];

const RANGE_OPTIONS = ['7d', 'monthly', 'yearly', 'custom'];

const EXPORT_ENTITIES = ['sales', 'medicines', 'stock', 'purchase-orders', 'customers'];

const Reports = () => {
  const { t } = useTranslation('reports');
  const { can, activePharmacy, user } = useAuth();
  const [tab, setTab] = useState('overview');
  const [rangeId, setRangeId] = useState('7d');
  const [customFrom, setCustomFrom] = useState(daysAgoIso(30));
  const [customTo, setCustomTo] = useState(todayIso());
  const [exportSpec, setExportSpec] = useState(null);
  const [exporting, setExporting] = useState('');
  const [exportError, setExportError] = useState('');

  const range = useMemo(
    () => (rangeId === 'custom' ? { range: 'custom', from: customFrom, to: customTo } : { range: rangeId }),
    [rangeId, customFrom, customTo]
  );
  const rangeKey = rangeId === 'custom' ? `custom|${customFrom}|${customTo}` : rangeId;
  const customInvalid = rangeId === 'custom' && (!customFrom || !customTo || customFrom > customTo);

  const handleTab = (id) => {
    setExportSpec(null);
    setTab(id);
  };
  const onExportSpec = useCallback((spec) => setExportSpec(spec), []);

  const periodLabel = rangeId === 'custom' ? t('periodRange', { from: customFrom, to: customTo }) : t(`ranges.${rangeId}`);
  const fileBase = exportSpec ? fileSlug(exportSpec.fileTitle || exportSpec.title) : 'report';

  const handleCSV = () => exportSpec && exportCSV(exportSpec.rows, exportSpec.columns, fileBase);
  const handlePDF = () =>
    exportSpec &&
    exportPDF({
      title: exportSpec.title,
      columns: exportSpec.columns,
      rows: exportSpec.rows,
      filename: fileBase,
      meta: {
        pharmacy: activePharmacy?.name,
        period: tab === 'slow' ? null : periodLabel,
        generatedBy: user?.name,
        summary: exportSpec.summary,
      },
    });

  const handleDataExport = async (entity) => {
    if (!entity) return;
    setExporting(entity);
    setExportError('');
    try {
      await downloadExport(entity, { format: 'xlsx', ...(entity === 'sales' ? range : {}) });
    } catch (err) {
      let message = t('exportFailed');
      const blob = err.response?.data;
      if (blob instanceof Blob) {
        try {
          message = JSON.parse(await blob.text()).message || message;
        } catch {
          // keep default
        }
      }
      setExportError(message);
    } finally {
      setExporting('');
    }
  };

  const tabProps = { range, rangeKey, onExportSpec };
  const dateInput = 'px-2 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300';

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 uppercase tracking-wider">
            {t('badge')}
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">{t('title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {tab !== 'slow' && (
            <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-medium">
              {RANGE_OPTIONS.map((id) => (
                <button
                  key={id}
                  onClick={() => setRangeId(id)}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
                    rangeId === id
                      ? 'bg-white dark:bg-[#161c26] text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {t(`ranges.${id}`)}
                </button>
              ))}
            </div>
          )}
          {tab !== 'slow' && rangeId === 'custom' && (
            <div className="flex items-center gap-1.5 text-xs">
              <div className="relative">
                <input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} className={dateInput} aria-label={t('fromDate')} aria-describedby="reports-from-eth" />
                <EthiopianDateHint value={customFrom} id="reports-from-eth" className="absolute left-0 top-full whitespace-nowrap" />
              </div>
              <span className="text-slate-400">{t('to')}</span>
              <div className="relative">
                <input type="date" value={customTo} min={customFrom} max={todayIso()} onChange={(e) => setCustomTo(e.target.value)} className={dateInput} aria-label={t('toDate')} aria-describedby="reports-to-eth" />
                <EthiopianDateHint value={customTo} id="reports-to-eth" className="absolute left-0 top-full whitespace-nowrap" />
              </div>
            </div>
          )}
          <button onClick={handleCSV} disabled={!exportSpec} className={btn} title={t('exportCsvTitle')}>
            <Download className="w-4 h-4" /> CSV
          </button>
          <button onClick={handlePDF} disabled={!exportSpec} className={btn} title={t('exportPdfTitle')}>
            <FileDown className="w-4 h-4" /> PDF
          </button>
          {can('data:export') && (
            <div className="relative">
              <FileSpreadsheet className="w-4 h-4 text-slate-500 absolute left-3 top-2 pointer-events-none" />
              <select
                value=""
                disabled={Boolean(exporting)}
                onChange={(e) => handleDataExport(e.target.value)}
                className="pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
                aria-label={t('exportExcelAria')}
              >
                <option value="">{exporting ? t('exporting') : t('excelData')}</option>
                {EXPORT_ENTITIES.map((id) => (
                  <option key={id} value={id}>
                    {t(`entities.${id}`)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {exportError && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 text-xs">{exportError}</div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200/80 dark:border-slate-800 -mt-2">
        {TABS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            onClick={() => handleTab(id)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition cursor-pointer ${
              tab === id
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {t(`tabs.${id}`)}
          </button>
        ))}
      </div>

      {customInvalid && tab !== 'slow' ? (
        <Empty>{t('invalidRange')}</Empty>
      ) : (
        <>
          {tab === 'overview' && <OverviewTab {...tabProps} />}
          {tab === 'profit' && <ProfitTab {...tabProps} />}
          {tab === 'staff' && <StaffTab {...tabProps} />}
          {tab === 'slow' && <SlowTab onExportSpec={onExportSpec} />}
          {tab === 'expiry' && <ExpiryTab {...tabProps} />}
          {tab === 'tax' && <TaxTab {...tabProps} />}
          {tab === 'compare' && <CompareTab {...tabProps} />}
        </>
      )}
    </div>
  );
};

export default Reports;
