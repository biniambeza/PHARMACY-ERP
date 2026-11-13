import { useMemo, useState } from 'react';
import {
  CalendarClock,
  AlertOctagon,
  AlertTriangle,
  Clock,
  Hourglass,
  RefreshCw,
  Truck,
  Phone,
  Mail,
  TrendingDown,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';
import { getExpiryOverview } from '../../api/notificationApi';
import useAsync from '../../hooks/useAsync';
import { formatMoney, formatDate } from '../../utils/format';

const BUCKETS = [
  { key: 'expired', icon: AlertOctagon, accent: 'text-rose-600 dark:text-rose-400', ring: 'ring-rose-500', chip: 'bg-rose-50 dark:bg-rose-950/40' },
  { key: 'd30', icon: AlertTriangle, accent: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-500', chip: 'bg-amber-50 dark:bg-amber-950/40' },
  { key: 'd60', icon: Clock, accent: 'text-yellow-600 dark:text-yellow-400', ring: 'ring-yellow-500', chip: 'bg-yellow-50 dark:bg-yellow-950/30' },
  { key: 'd90', icon: Hourglass, accent: 'text-sky-600 dark:text-sky-400', ring: 'ring-sky-500', chip: 'bg-sky-50 dark:bg-sky-950/40' },
];

const card =
  'bg-white dark:bg-[#161c26] border border-slate-100/90 dark:border-slate-800/80 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.04)]';

const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
};

const daysLabel = (t, item) => {
  if (item.daysLeft <= 0) return item.daysLeft === 0 ? t('days.today') : t('days.ago', { count: Math.abs(item.daysLeft) });
  return t('days.left', { count: item.daysLeft });
};

const Expiry = () => {
  const { t } = useTranslation('expiry');
  const [activeBucket, setActiveBucket] = useState('expired');
  const [openSuppliers, setOpenSuppliers] = useState({});

  const { data, error: loadError, loading, reload: load } = useAsync(getExpiryOverview);
  const error = loadError ? loadError.response?.data?.message || t('errors.load') : '';

  const currency = data?.currency || 'ETB';
  const money = (v) => formatMoney(v, currency);
  const bucket = data?.buckets?.[activeBucket];
  const writeOffs = useMemo(() => data?.writeOffs || [], [data]);
  const maxWriteOff = Math.max(1, ...writeOffs.map((w) => w.costValue));
  const totalWriteOff = writeOffs.reduce((s, w) => s + w.costValue, 0);
  const atRisk = data
    ? ['d30', 'd60', 'd90'].reduce((s, k) => s + (data.buckets[k]?.costValue || 0), 0)
    : 0;

  const toggleSupplier = (key) => setOpenSuppliers((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 uppercase tracking-wider">
            {t('badge')}
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">
            {t('title')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-[#161c26] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold rounded-xl transition cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {t('common:buttons.refresh')}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400 text-xs">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="p-16 flex justify-center">
          <span className="w-7 h-7 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : data ? (
        <>
          {/* Bucket cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {BUCKETS.map((b) => {
              const info = data.buckets[b.key];
              const Icon = b.icon;
              const active = activeBucket === b.key;
              return (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setActiveBucket(b.key)}
                  className={`${card} text-left p-4 sm:p-5 transition cursor-pointer hover:-translate-y-0.5 ${
                    active ? `ring-2 ${b.ring}` : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t(`buckets.${b.key}`, { defaultValue: info.label })}</span>
                    <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${b.chip}`}>
                      <Icon className={`w-4 h-4 ${b.accent}`} />
                    </span>
                  </div>
                  <p className={`text-2xl font-bold mt-2 ${b.accent}`}>{info.count}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t('bucketSummary', { count: info.count, units: info.quantity.toLocaleString() })}
                  </p>
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <p className="text-slate-400">{t('atCost')}</p>
                      <p className="font-semibold text-slate-800 dark:text-slate-100">{money(info.costValue)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">{t('atRetail')}</p>
                      <p className="font-semibold text-slate-800 dark:text-slate-100">{money(info.retailValue)}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Bucket detail table */}
          <div className={`${card} overflow-hidden`}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">{t('bucketBatches', { label: t(`buckets.${activeBucket}`, { defaultValue: bucket?.label }) })}</h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('sortedByExpiry')}</p>
              </div>
            </div>
            {!bucket?.items?.length ? (
              <p className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">{t('noBatches')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="text-left font-semibold px-5 py-2.5">{t('table.medicine')}</th>
                      <th className="text-left font-semibold px-3 py-2.5">{t('table.batch')}</th>
                      <th className="text-left font-semibold px-3 py-2.5">{t('table.expiry')}</th>
                      <th className="text-right font-semibold px-3 py-2.5">{t('table.qty')}</th>
                      <th className="text-right font-semibold px-3 py-2.5">{t('table.costValue')}</th>
                      <th className="text-right font-semibold px-5 py-2.5">{t('table.retailValue')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {bucket.items.map((item) => (
                      <tr key={item.batchId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                        <td className="px-5 py-2.5 font-medium text-slate-900 dark:text-white">
                          {item.medicineName}
                          {item.strength && <span className="text-slate-400 font-normal"> {item.strength}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 font-mono">{item.batchNo}</td>
                        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {formatDate(item.expiryDate)}
                          <span className={`ml-2 text-[10px] font-semibold ${item.daysLeft <= 0 ? 'text-rose-500' : 'text-amber-500'}`}>
                            {daysLabel(t, item)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-700 dark:text-slate-200">{item.quantity}</td>
                        <td className="px-3 py-2.5 text-right text-slate-700 dark:text-slate-200">{money(item.costValue)}</td>
                        <td className="px-5 py-2.5 text-right text-slate-700 dark:text-slate-200">{money(item.retailValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Write-off per month */}
            <div className={`${card} p-5 lg:col-span-2`}>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-rose-500" />
                    {t('writeOffs.title')}
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('writeOffs.subtitle')}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-slate-400">{t('common:labels.total')}</p>
                  <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{money(totalWriteOff)}</p>
                </div>
              </div>
              <div className="mt-5 space-y-2">
                {writeOffs.map((w) => (
                  <div key={w.month} className="flex items-center gap-3 text-[11px]">
                    <span className="w-14 shrink-0 text-slate-500 dark:text-slate-400">{monthLabel(w.month)}</span>
                    <div className="flex-1 h-4 bg-slate-100 dark:bg-slate-800/70 rounded-md overflow-hidden">
                      <div
                        className="h-full bg-rose-400/80 dark:bg-rose-500/70 rounded-md"
                        style={{ width: `${(w.costValue / maxWriteOff) * 100}%` }}
                        title={t('writeOffs.barTitle', { count: w.quantity, retail: money(w.retailValue) })}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right font-medium text-slate-700 dark:text-slate-200">
                      {money(w.costValue)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[11px] text-slate-500 dark:text-slate-400">
                <Trans
                  t={t}
                  i18nKey="writeOffs.atRisk"
                  values={{ amount: money(atRisk) }}
                  components={{ b: <span className="font-semibold text-amber-600 dark:text-amber-400" /> }}
                />
              </p>
            </div>

            {/* Return to supplier */}
            <div className={`${card} p-5 lg:col-span-3`}>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Truck className="w-4 h-4 text-emerald-500" />
                {t('returns.title')}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('returns.subtitle')}
              </p>
              {!data.returnToSupplier.length ? (
                <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">{t('returns.empty')}</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {data.returnToSupplier.map((g) => {
                    const key = g.supplierId || 'unknown';
                    const open = !!openSuppliers[key];
                    return (
                      <div key={key} className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => toggleSupplier(key)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition cursor-pointer text-left"
                        >
                          {open ? (
                            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-semibold ${g.supplierId ? 'text-slate-900 dark:text-white' : 'text-slate-500 italic'}`}>
                              {g.name}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3">
                              <span>
                                {t('returns.groupSummary', { count: g.count, units: g.quantity })}
                              </span>
                              {g.phone && (
                                <span className="inline-flex items-center gap-1">
                                  <Phone className="w-3 h-3" />
                                  {g.phone}
                                </span>
                              )}
                              {g.email && (
                                <span className="inline-flex items-center gap-1">
                                  <Mail className="w-3 h-3" />
                                  {g.email}
                                </span>
                              )}
                            </p>
                          </div>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 shrink-0">{money(g.costValue)}</span>
                        </button>
                        {open && (
                          <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
                            <table className="w-full text-[11px]">
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                                {g.items.map((item) => (
                                  <tr key={item.batchId}>
                                    <td className="px-4 py-2 text-slate-800 dark:text-slate-100">{item.medicineName}</td>
                                    <td className="px-2 py-2 font-mono text-slate-500">{item.batchNo}</td>
                                    <td className="px-2 py-2 text-slate-500 whitespace-nowrap">
                                      {formatDate(item.expiryDate)}{' '}
                                      <span className={item.daysLeft <= 0 ? 'text-rose-500' : 'text-amber-500'}>({daysLabel(t, item)})</span>
                                    </td>
                                    <td className="px-2 py-2 text-right text-slate-600 dark:text-slate-300">{item.quantity}</td>
                                    <td className="px-2 py-2 text-slate-400 whitespace-nowrap">
                                      {item.poNumber || (item.supplierSource ? t(`sources.${item.supplierSource}`, { defaultValue: '' }) : '')}
                                    </td>
                                    <td className="px-4 py-2 text-right text-slate-700 dark:text-slate-200">{money(item.costValue)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className={`${card} p-12 text-center`}>
          <CalendarClock className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{t('noData')}</p>
        </div>
      )}
    </div>
  );
};

export default Expiry;
