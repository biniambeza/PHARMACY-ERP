import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CreditCard, Smartphone, Banknote, Wallet } from 'lucide-react';
import { formatMoney } from '../../utils/format';

// Shared helpers for the Reports page tabs.

export const PAYMENT_META = {
  cash: { color: '#10b981', icon: Banknote },
  card: { color: '#6366f1', icon: CreditCard },
  mobile_money: { color: '#06b6d4', icon: Smartphone },
  credit: { color: '#f59e0b', icon: Wallet },
};

export const card = 'bg-white dark:bg-[#161c26] rounded-2xl border border-slate-100/90 dark:border-slate-800/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5 sm:p-6';
export const btn =
  'inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-xs font-semibold rounded-xl shadow-2xs transition cursor-pointer disabled:opacity-50';
export const th = 'pb-3 text-[11px] uppercase tracking-wider font-semibold text-slate-400';
export const money = (v) => formatMoney(v);
export const pct = (v, na = 'n/a') => (v === null || v === undefined ? na : `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)}%`);
export const todayIso = () => new Date().toISOString().slice(0, 10);
export const daysAgoIso = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
// Export file names stay English (built from the English title) whatever the UI language.
export const fileSlug = (title) => String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-');
export const EN = { lng: 'en' };

// Small data-loading hook: re-runs when `key` changes.
export const useReport = (fetcher, key) => {
  const { t } = useTranslation('reports');
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const data = await fetcher();
      setState({ data, loading: false, error: '' });
    } catch (err) {
      setState({ data: null, loading: false, error: err.response?.data?.message || t('loadFailed') });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    run();
  }, [run]);
  return { ...state, reload: run };
};
