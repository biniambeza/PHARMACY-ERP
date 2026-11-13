import { useCallback, useState } from 'react';
import useAsync from '../../hooks/useAsync';
import { Loader2, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useTranslation } from 'react-i18next';
import { getConsolidatedReport } from '../../api/transferApi';
import { formatMoney } from '../../utils/format';
import EthiopianDateHint from '../common/EthiopianDateHint';

const toInput = (d) => d.toISOString().slice(0, 10);

// Consolidated figures across all branches of the organization (owner only).
const BranchesOverview = () => {
  const { t } = useTranslation('transfers');
  const [from, setFrom] = useState(() => toInput(new Date(Date.now() - 29 * 864e5)));
  const [to, setTo] = useState(() => toInput(new Date()));
  const fetchReport = useCallback(() => getConsolidatedReport({ from, to }), [from, to]);
  const { data, error: loadError, loading, reload: load } = useAsync(fetchReport);
  const error = loadError ? loadError.response?.data?.message || t('overview.errors.load') : '';

  const inputClass =
    'px-3 py-1.5 bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative">
          <label className="block text-xs">
            <span className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">{t('overview.from')}</span>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inputClass} aria-describedby="branches-from-eth" />
          </label>
          <EthiopianDateHint value={from} id="branches-from-eth" className="absolute left-0 top-full whitespace-nowrap" />
        </div>
        <div className="relative">
          <label className="block text-xs">
            <span className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">{t('overview.to')}</span>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputClass} aria-describedby="branches-to-eth" />
          </label>
          <EthiopianDateHint value={to} id="branches-to-eth" className="absolute left-0 top-full whitespace-nowrap" />
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" /> {t('common:buttons.refresh')}
        </button>
        {data?.organization && (
          <span className="text-xs text-slate-500 dark:text-slate-400 ml-auto">
            {t('overview.organization')} <strong className="text-slate-800 dark:text-slate-200">{data.organization.name}</strong>
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> {t('common:labels.loading')}
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      ) : (
        data && (
          <>
            <div className="bg-white dark:bg-[#161c26] rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-3">{t('overview.chartTitle')}</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.branches} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                    <Tooltip formatter={(v) => formatMoney(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="salesTotal" name={t('overview.sales')} fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="stockValue" name={t('overview.stockValueCost')} fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white dark:bg-[#161c26] rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-3">{t('overview.columns.branch')}</th>
                    <th className="text-right px-4 py-3">{t('overview.sales')}</th>
                    <th className="text-right px-4 py-3">{t('overview.columns.transactions')}</th>
                    <th className="text-right px-4 py-3">{t('overview.columns.stockValue')}</th>
                    <th className="text-right px-4 py-3">{t('overview.columns.units')}</th>
                    <th className="text-right px-4 py-3">{t('common:status.lowStock')}</th>
                    <th className="text-right px-4 py-3">{t('common:status.outOfStock')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.branches.map((b) => (
                    <tr key={b.pharmacyId} className="text-slate-700 dark:text-slate-300">
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-900 dark:text-white">{b.name}</span>
                        {b.status !== 'active' && <span className="ml-2 text-[10px] text-rose-500 uppercase">{t(`common:status.${b.status}`, { defaultValue: b.status })}</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{formatMoney(b.salesTotal)}</td>
                      <td className="px-4 py-3 text-right">{b.salesCount}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatMoney(b.stockValue)}</td>
                      <td className="px-4 py-3 text-right">{b.stockUnits}</td>
                      <td className={`px-4 py-3 text-right ${b.lowStockCount ? 'text-amber-600 font-semibold' : ''}`}>{b.lowStockCount}</td>
                      <td className={`px-4 py-3 text-right ${b.outOfStockCount ? 'text-rose-600 font-semibold' : ''}`}>{b.outOfStockCount}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 dark:bg-slate-800/50 font-bold text-slate-900 dark:text-white">
                  <tr>
                    <td className="px-4 py-3">{t('common:labels.total')}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatMoney(data.total.salesTotal)}</td>
                    <td className="px-4 py-3 text-right">{data.total.salesCount}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatMoney(data.total.stockValue)}</td>
                    <td className="px-4 py-3 text-right">{data.total.stockUnits}</td>
                    <td className="px-4 py-3 text-right">{data.total.lowStockCount}</td>
                    <td className="px-4 py-3 text-right">{data.total.outOfStockCount}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )
      )}
    </div>
  );
};

export default BranchesOverview;
