import { CreditCard, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../../utils/format';
import { cardCls, AGING_BUCKETS } from './customerUi';

/** Total receivable card + aging bucket cards. */
export const ReceivablesSummary = ({ summary, aging }) => {
  const { t } = useTranslation('customers');
  const overdue = aging ? (aging.totals['31-60'] || 0) + (aging.totals['61-90'] || 0) + (aging.totals['90+'] || 0) : 0;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
      <div className={`${cardCls} p-5`}>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <CreditCard className="w-4 h-4 text-emerald-600" /> {t('summary.totalReceivable')}
        </div>
        <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{formatMoney(summary.receivable)}</p>
        <p className="text-[11px] text-slate-500 mt-1">
          {t('summary.withBalance', { count: summary.withBalance, active: summary.active })}
        </p>
      </div>
      <div className={`${cardCls} p-5 lg:col-span-2`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Clock className="w-4 h-4 text-amber-500" /> {t('summary.aging')}
          </div>
          {overdue > 0 && (
            <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
              {t('summary.overdue', { amount: formatMoney(overdue) })}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          {AGING_BUCKETS.map((b, i) => (
            <div
              key={b}
              className={`rounded-xl p-3 border ${
                i === 0
                  ? 'border-emerald-100 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20'
                  : i === 3
                    ? 'border-rose-100 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20'
                    : 'border-amber-100 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20'
              }`}
            >
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">{t('summary.bucketDays', { bucket: b })}</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{formatMoney(aging?.totals?.[b] || 0)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/** Receivables aging broken down by customer. */
export const AgingByCustomer = ({ aging }) => {
  const { t } = useTranslation('customers');
  if (!(aging?.customers?.length > 0)) return null;
  return (
    <div className={`${cardCls} overflow-hidden`}>
      <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 text-sm font-bold text-slate-900 dark:text-white">
        {t('agingTable.title')}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50/75 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-5">{t('table.customer')}</th>
              {AGING_BUCKETS.map((b) => (
                <th key={b} className="py-3 px-4 text-right">
                  {b}
                </th>
              ))}
              <th className="py-3 px-5 text-right">{t('common:labels.total')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
            {aging.customers.map((r) => (
              <tr key={r.customerId}>
                <td className="py-2.5 px-5 font-semibold text-slate-900 dark:text-white">{r.name}</td>
                {AGING_BUCKETS.map((b) => (
                  <td key={b} className={`py-2.5 px-4 text-right ${b === '90+' && r.buckets[b] > 0 ? 'text-rose-600 dark:text-rose-400' : ''}`}>
                    {r.buckets[b] ? formatMoney(r.buckets[b]) : '-'}
                  </td>
                ))}
                <td className="py-2.5 px-5 text-right font-bold">{formatMoney(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
