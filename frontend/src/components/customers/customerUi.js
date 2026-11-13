import { formatMoney } from '../../utils/format';

export const inputCls =
  'w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition';
export const labelCls = 'block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1';
export const cardCls =
  'bg-white dark:bg-[#161c26] border border-slate-100/90 dark:border-slate-800/80 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.04)]';
export const btnPrimary =
  'inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer';
export const btnGhost =
  'px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold rounded-xl transition cursor-pointer';

// Labels are i18n keys in the `customers` namespace (paymentMethods.<value>).
export const PAYMENT_METHODS = ['cash', 'card', 'mobile_money', 'bank_transfer', 'cheque', 'other'];

export const AGING_BUCKETS = ['0-30', '31-60', '61-90', '90+'];

export const errMsg = (err, fallback) => err?.response?.data?.message || fallback;

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const limitLabel = (limit, t) =>
  limit === null || limit === undefined ? t('limit.unlimited') : limit === 0 ? t('limit.noCredit') : formatMoney(limit);
