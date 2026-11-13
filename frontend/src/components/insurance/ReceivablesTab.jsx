import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getInsuranceReceivables } from '../../api/insuranceApi';
import { formatMoney } from '../../utils/format';
import { cardCls, AGING_BUCKETS, thCls, tdCls } from './insuranceUi';

// Outstanding insurer receivables per scheme with aging.
const ReceivablesTab = () => {
  const { t } = useTranslation('insurance');
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getInsuranceReceivables()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="text-xs text-rose-600">{t('errors.generic')}</p>;
  if (!data) return <p className="text-xs text-slate-500">{t('loading')}</p>;

  const { totals } = data;
  const cards = [
    ['receivables.outstanding', totals.outstanding, 'text-amber-600'],
    ['receivables.unclaimed', totals.unclaimed, 'text-slate-900 dark:text-white'],
    ['receivables.draft', totals.draft, 'text-slate-900 dark:text-white'],
    ['receivables.submitted', totals.submitted, 'text-sky-600'],
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(([k, v, cls]) => (
          <div key={k} className={`${cardCls} p-4`}>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">{t(k)}</div>
            <div className={`text-lg font-extrabold font-mono mt-1 ${cls}`}>{formatMoney(v)}</div>
          </div>
        ))}
      </div>
      <div className={`${cardCls} overflow-x-auto`}>
        <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800">
          <thead>
            <tr>
              <th className={thCls}>{t('fields.scheme')}</th>
              <th className={`${thCls} text-right`}>{t('receivables.unclaimed')}</th>
              <th className={`${thCls} text-right`}>{t('receivables.draft')}</th>
              <th className={`${thCls} text-right`}>{t('receivables.submitted')}</th>
              {AGING_BUCKETS.map((b) => <th key={b} className={`${thCls} text-right`}>{t(`aging.${b}`)}</th>)}
              <th className={`${thCls} text-right`}>{t('receivables.outstanding')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.schemes.length === 0 ? (
              <tr><td colSpan={9} className={`${tdCls} text-center py-8 text-slate-400`}>{t('schemes.empty')}</td></tr>
            ) : (
              data.schemes.map((r) => (
                <tr key={r.schemeId}>
                  <td className={tdCls}>
                    <div className="font-semibold text-slate-900 dark:text-white">{r.name}</div>
                    <div className="text-[10px] text-slate-400">{t(`types.${r.type}`)}{r.unclaimedCount ? ` · ${t('receivables.unclaimedSales', { count: r.unclaimedCount })}` : ''}</div>
                  </td>
                  <td className={`${tdCls} text-right font-mono`}>{formatMoney(r.unclaimed)}</td>
                  <td className={`${tdCls} text-right font-mono`}>{formatMoney(r.draft)}</td>
                  <td className={`${tdCls} text-right font-mono`}>{formatMoney(r.submitted)}</td>
                  {AGING_BUCKETS.map((b) => (
                    <td key={b} className={`${tdCls} text-right font-mono ${b === '90_plus' && r.aging[b] > 0 ? 'text-rose-600 font-semibold' : ''}`}>{formatMoney(r.aging[b])}</td>
                  ))}
                  <td className={`${tdCls} text-right font-mono font-bold`}>{formatMoney(r.outstanding)}</td>
                </tr>
              ))
            )}
          </tbody>
          {data.schemes.length > 0 && (
            <tfoot className="border-t-2 border-slate-200 dark:border-slate-700">
              <tr>
                <td className={`${tdCls} font-bold`}>{t('fields.total')}</td>
                <td className={`${tdCls} text-right font-mono font-bold`}>{formatMoney(totals.unclaimed)}</td>
                <td className={`${tdCls} text-right font-mono font-bold`}>{formatMoney(totals.draft)}</td>
                <td className={`${tdCls} text-right font-mono font-bold`}>{formatMoney(totals.submitted)}</td>
                {AGING_BUCKETS.map((b) => <td key={b} className={`${tdCls} text-right font-mono font-bold`}>{formatMoney(totals.aging[b])}</td>)}
                <td className={`${tdCls} text-right font-mono font-bold`}>{formatMoney(totals.outstanding)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

export default ReceivablesTab;
