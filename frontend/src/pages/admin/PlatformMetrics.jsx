import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { getPlatformMetrics, runSubscriptionCheck } from '../../api/adminApi';
import { formatMoney } from '../../utils/format';

const card = 'bg-white dark:bg-[#161c26] rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5';

const Stat = ({ label, value, hint, tone = 'text-slate-900 dark:text-white' }) => (
  <div className={card}>
    <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">{label}</p>
    <p className={`text-xl font-extrabold mt-1 ${tone}`}>{value}</p>
    {hint && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{hint}</p>}
  </div>
);

// Platform-wide usage metrics (#24)
const PlatformMetrics = () => {
  const { t } = useTranslation('admin');
  const [months, setMonths] = useState(12);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getPlatformMetrics(months);
      setMetrics(data.metrics);
    } catch (err) {
      setError(err.response?.data?.message || t('metrics.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [months, t]);

  useEffect(() => {
    load();
  }, [load]);

  const check = async () => {
    setChecking(true);
    try {
      const { result } = await runSubscriptionCheck();
      alert(t('metrics.checkDone', { pastDue: result.pastDue, suspended: result.suspended }));
      window.dispatchEvent(new CustomEvent('refresh-admin-data'));
      await load();
    } catch (err) {
      alert(err.response?.data?.message || t('metrics.checkFailed'));
    } finally {
      setChecking(false);
    }
  };

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-xs text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> {t('metrics.loading')}
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-300">
        {error}
      </div>
    );
  }
  if (!metrics) return null;

  const growth = metrics.monthOverMonthGrowth;
  const subs = metrics.subscriptions || {};

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
          className="px-3 py-2 bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-200"
        >
          <option value={6}>{t('metrics.lastMonths', { count: 6 })}</option>
          <option value={12}>{t('metrics.lastMonths', { count: 12 })}</option>
          <option value={24}>{t('metrics.lastMonths', { count: 24 })}</option>
        </select>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> {t('buttons.refresh', { ns: 'common' })}
        </button>
        <button
          onClick={check}
          disabled={checking}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 cursor-pointer disabled:opacity-50"
        >
          <ShieldAlert className="w-3.5 h-3.5" /> {checking ? t('metrics.checking') : t('metrics.runCheck')}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          label={t('metrics.activePharmacies')}
          value={metrics.pharmacies.active}
          hint={t('metrics.soldLast30', { count: metrics.pharmacies.sellingLast30Days })}
        />
        <Stat
          label={t('metrics.salesVolume')}
          value={formatMoney(metrics.totalVolume)}
          hint={t('metrics.transactionsInPeriod', { count: metrics.totalTransactions })}
        />
        <Stat
          label={t('metrics.mom')}
          value={growth === null ? t('metrics.na') : `${growth > 0 ? '+' : ''}${growth}%`}
          tone={growth === null ? 'text-slate-500' : growth >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}
          hint={t('metrics.momHint')}
        />
        <Stat
          label={t('metrics.billing')}
          value={t('metrics.pastDueCount', { count: subs.past_due || 0 })}
          tone={(subs.past_due || 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}
          hint={t('metrics.billingHint', {
            active: subs.active || 0,
            trial: subs.trial || 0,
            cancelled: subs.cancelled || 0,
            suspended: metrics.pharmacies.suspended,
          })}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className={card}>
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-3">{t('metrics.volumeByMonth')}</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics.salesByMonth} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="volFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip formatter={(v, name) => (name === t('metrics.volume') ? formatMoney(v) : v)} />
                <Area type="monotone" dataKey="volume" name={t('metrics.volume')} stroke="#10b981" fill="url(#volFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className={card}>
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-3">{t('metrics.pharmacyGrowth')}</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.salesByMonth} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="newPharmacies" name={t('metrics.newPharmacies')} fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="activePharmacies" name={t('metrics.pharmaciesWithSales')} fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className={`${card} overflow-x-auto`}>
        <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-3">{t('metrics.topPharmacies')}</h3>
        {metrics.topPharmacies.length === 0 ? (
          <p className="text-xs text-slate-400">{t('metrics.noSales')}</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-slate-400 uppercase text-[10px]">
              <tr>
                <th className="text-left py-2">#</th>
                <th className="text-left py-2">{t('metrics.pharmacy')}</th>
                <th className="text-right py-2">{t('metrics.volume')}</th>
                <th className="text-right py-2">{t('metrics.transactions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {metrics.topPharmacies.map((p, i) => (
                <tr key={p.pharmacyId} className="text-slate-700 dark:text-slate-300">
                  <td className="py-2">{i + 1}</td>
                  <td className="py-2 font-semibold">
                    {p.name}
                    {p.status && p.status !== 'active' && <span className="ml-2 text-[10px] uppercase text-rose-500">{t(`status.${p.status}`, { ns: 'common', defaultValue: p.status })}</span>}
                  </td>
                  <td className="py-2 text-right font-mono">{formatMoney(p.volume)}</td>
                  <td className="py-2 text-right">{p.transactions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {metrics.plans?.length > 0 && (
          <p className="mt-4 text-[11px] text-slate-500 dark:text-slate-400">
            {t('metrics.plans', { list: metrics.plans.map((p) => `${p.plan} (${p.count})`).join(', ') })}
          </p>
        )}
      </div>
    </div>
  );
};

export default PlatformMetrics;
