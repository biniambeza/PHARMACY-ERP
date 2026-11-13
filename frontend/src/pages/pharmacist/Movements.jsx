import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, Download, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { getMovements } from '../../api/movementApi';
import { getMedicineById } from '../../api/medicineApi';
import { formatDateTime, formatDate } from '../../utils/format';
import { toCSV, downloadCSV } from '../../components/catalog/csv';
import { MOVEMENT_TYPE_LABELS } from '../../components/catalog/catalogUtils';
import { inputCls, labelCls, cardCls, secondaryBtn, theadCls, errorBox } from '../../components/catalog/styles';
import EthiopianDateHint from '../../components/common/EthiopianDateHint';
import MedicinePicker from '../../components/common/MedicinePicker';

const PAGE_SIZE = 50;
const EXPORT_PAGE_SIZE = 500;
const EXPORT_MAX_PAGES = 40; // 20,000 rows


// Stock movement ledger (#15): every stock change with date, type, change, balance, user and reason.
const Movements = () => {
  const { t } = useTranslation('movements');
  const typeLabel = (type) => t(`types.${type}`, { defaultValue: MOVEMENT_TYPE_LABELS[type] || type });
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = {
    medicineId: searchParams.get('medicineId') || '',
    batchId: searchParams.get('batchId') || '',
    type: searchParams.get('type') || '',
    from: searchParams.get('from') || '',
    to: searchParams.get('to') || '',
  };
  const page = Math.max(1, parseInt(searchParams.get('page'), 10) || 1);

  // Medicines picked in the filter (or looked up for a ?medicineId= link), by id, for the picker label
  const [knownMedicines, setKnownMedicines] = useState({});
  const [data, setData] = useState({ movements: [], total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const queryKey = searchParams.toString();

  const buildParams = useCallback(() => {
    const params = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params[k] = v;
    });
    return params;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  const filterMedicine = filters.medicineId
    ? knownMedicines[filters.medicineId] ||
      data.movements.find((m) => m.medicineId?._id === filters.medicineId)?.medicineId ||
      null
    : null;
  const needsMedicineLookup = Boolean(filters.medicineId) && !filterMedicine;

  // A ?medicineId= link (e.g. from another page) with no movements on screen: fetch its name once.
  useEffect(() => {
    if (!needsMedicineLookup) return undefined;
    let active = true;
    const id = filters.medicineId;
    getMedicineById(id)
      .then((res) => active && res.medicine && setKnownMedicines((prev) => ({ ...prev, [id]: res.medicine })))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [needsMedicineLookup, filters.medicineId]);

  useEffect(() => {
    let active = true;
    getMovements({ ...buildParams(), page, limit: PAGE_SIZE })
      .then((res) => {
        if (!active) return;
        setData(res);
        setError('');
      })
      .catch((err) => active && setError(err.response?.data?.message || t('loadFailed')))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [buildParams, page, t]);

  const setFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setSearchParams(next);
  };

  const setPage = (p) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(p));
    setSearchParams(next);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const rows = [];
      for (let p = 1; p <= EXPORT_MAX_PAGES; p += 1) {
         
        const res = await getMovements({ ...buildParams(), page: p, limit: EXPORT_PAGE_SIZE });
        res.movements.forEach((m) => {
          rows.push([
            new Date(m.createdAt).toISOString(),
            typeLabel(m.type),
            m.medicineId?.name || '',
            m.batchId?.batchNo || '',
            m.batchId?.expiryDate ? new Date(m.batchId.expiryDate).toISOString().slice(0, 10) : '',
            m.quantityChange,
            m.balanceAfter,
            m.userId?.name || '',
            m.reason || '',
            m.refModel || '',
          ]);
        });
        if (p >= res.pages) break;
      }
      const csv = toCSV(
        [
          t('csv.date'), t('csv.type'), t('csv.medicine'), t('csv.batch'), t('csv.expiry'),
          t('csv.change'), t('csv.balanceAfter'), t('csv.user'), t('csv.reason'), t('csv.reference'),
        ],
        rows
      );
      downloadCSV(`stock-movements-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    } catch (err) {
      setError(err.response?.data?.message || t('exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  const batchLabel = data.movements.find((m) => m.batchId?._id === filters.batchId)?.batchId?.batchNo;

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800/60 uppercase tracking-wider">
            {t('badge')}
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">{t('title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('subtitle')}
          </p>
        </div>
        <button type="button" className={secondaryBtn} onClick={handleExport} disabled={exporting || !data.total}>
          <Download className="w-4 h-4" /> {exporting ? t('exporting') : t('exportCsv')}
        </button>
      </div>

      <div className={`${cardCls} p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3`}>
        <div className="lg:col-span-2">
          <label htmlFor="movements-medicine" className={labelCls}>{t('filters.medicine')}</label>
          <MedicinePicker
            id="movements-medicine"
            value={filterMedicine || (filters.medicineId ? { _id: filters.medicineId, name: '...' } : null)}
            onChange={(med) => {
              if (med) setKnownMedicines((prev) => ({ ...prev, [med._id]: med }));
              setFilter('medicineId', med?._id || '');
            }}
            includeArchived
            placeholder={t('filters.allMedicines')}
            inputClassName={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>{t('filters.type')}</label>
          <select className={inputCls} value={filters.type} onChange={(e) => setFilter('type', e.target.value)}>
            <option value="">{t('filters.allTypes')}</option>
            {Object.keys(MOVEMENT_TYPE_LABELS).map((k) => (
              <option key={k} value={k}>{typeLabel(k)}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="movements-from" className={labelCls}>{t('filters.from')}</label>
          <input id="movements-from" type="date" className={inputCls} value={filters.from} onChange={(e) => setFilter('from', e.target.value)} aria-describedby="movements-from-eth" />
          <EthiopianDateHint value={filters.from} id="movements-from-eth" />
        </div>
        <div>
          <label htmlFor="movements-to" className={labelCls}>{t('filters.to')}</label>
          <input id="movements-to" type="date" className={inputCls} value={filters.to} onChange={(e) => setFilter('to', e.target.value)} aria-describedby="movements-to-eth" />
          <EthiopianDateHint value={filters.to} id="movements-to-eth" />
        </div>
        {filters.batchId && (
          <div className="sm:col-span-2 lg:col-span-5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60">
              {t('filters.batchChip', { batch: batchLabel || filters.batchId.slice(-6) })}
              <button type="button" aria-label={t('filters.clearBatch')} onClick={() => setFilter('batchId', '')} className="cursor-pointer">
                <X className="w-3 h-3" />
              </button>
            </span>
          </div>
        )}
      </div>

      {error && <div className={errorBox}>{error}</div>}

      <div className={`${cardCls} overflow-hidden`}>
        <div className="overflow-x-auto">
          {loading ? (
            <p className="p-8 text-xs text-slate-500">{t('common:labels.loading')}</p>
          ) : data.movements.length === 0 ? (
            <div className="py-16 text-center">
              <ArrowLeftRight className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm font-bold text-slate-900 dark:text-white">{t('empty')}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('emptyHint')}</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className={theadCls}>
                <tr>
                  <th className="py-3 px-5">{t('table.date')}</th>
                  <th className="py-3 px-4">{t('table.type')}</th>
                  <th className="py-3 px-4">{t('table.medicine')}</th>
                  <th className="py-3 px-4">{t('table.batch')}</th>
                  <th className="py-3 px-4 text-right">{t('table.change')}</th>
                  <th className="py-3 px-4 text-right">{t('table.balance')}</th>
                  <th className="py-3 px-4">{t('table.user')}</th>
                  <th className="py-3 px-5">{t('table.reasonRef')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                {data.movements.map((m) => (
                  <tr key={m._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-5 whitespace-nowrap">{formatDateTime(m.createdAt)}</td>
                    <td className="py-2.5 px-4">
                      <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold">
                        {typeLabel(m.type)}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <button
                        type="button"
                        className="font-semibold text-slate-900 dark:text-white hover:text-emerald-600 cursor-pointer text-left"
                        onClick={() => m.medicineId?._id && setFilter('medicineId', m.medicineId._id)}
                      >
                        {m.medicineId?.name || '-'}
                      </button>
                    </td>
                    <td className="py-2.5 px-4 font-mono">
                      <button
                        type="button"
                        className="hover:text-emerald-600 cursor-pointer"
                        onClick={() => m.batchId?._id && setFilter('batchId', m.batchId._id)}
                      >
                        {m.batchId?.batchNo || '-'}
                      </button>
                      {m.batchId?.expiryDate && (
                        <span className="block text-[10px] text-slate-400">{t('table.exp', { date: formatDate(m.batchId.expiryDate) })}</span>
                      )}
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono font-bold ${
                        m.quantityChange > 0 ? 'text-emerald-600 dark:text-emerald-400' : m.quantityChange < 0 ? 'text-rose-600 dark:text-rose-400' : ''
                      }`}
                    >
                      {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono">{m.balanceAfter}</td>
                    <td className="py-2.5 px-4">{m.userId?.name || '-'}</td>
                    <td className="py-2.5 px-5 text-slate-500 dark:text-slate-400 max-w-xs truncate" title={m.reason}>
                      {m.reason || m.refModel || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {data.total > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400">
            <span>
              {t('pagination', { count: data.total, page, pages: data.pages || 1 })}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" className={secondaryBtn} disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button type="button" className={secondaryBtn} disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Movements;
