// Shared styles and helpers for the Payables page (pages/pharmacist/Payables.jsx).

export const inputCls =
  'w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition';
export const labelCls = 'block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1';
export const cardCls =
  'bg-white dark:bg-[#161c26] border border-slate-100/90 dark:border-slate-800/80 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.04)]';
export const btnPrimary =
  'inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer';
export const btnGhost =
  'px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold rounded-xl transition cursor-pointer';
export const thCls = 'py-3 px-4';
export const theadCls =
  'bg-slate-50/75 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-100 dark:border-slate-800';
export const tbodyCls = 'divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300 font-medium';
export const payBtnCls =
  'px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg cursor-pointer';

// Payment method values; labels come from the `payables:methods.*` keys.
export const METHODS = ['bank_transfer', 'cash', 'cheque', 'mobile_money', 'card', 'other'];
export const AP_BUCKETS = ['current', '1-30', '31-60', '61-90', '90+'];

export const errMsg = (err, fallback) => err?.response?.data?.message || fallback;
export const balanceOf = (inv) => Math.max(0, Math.round(((inv.amount || 0) - (inv.amountPaid || 0)) * 100) / 100);
export const isOverdue = (inv) => inv.status !== 'paid' && new Date(inv.dueDate) < new Date();
export const today = () => new Date().toISOString().slice(0, 10);
