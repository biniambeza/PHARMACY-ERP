// Shared styling + helpers for the insurance module. Owner: Insurance agent.
export {
  inputCls,
  labelCls,
  cardCls,
  btnPrimary,
  btnGhost,
  escapeHtml,
} from '../customers/customerUi';

export const errMsg = (err, fallback) => err?.response?.data?.message || fallback;

export const SCHEME_TYPES = ['cbhi', 'employer', 'private', 'other'];
export const COPAY_TYPES = ['none', 'percent', 'fixed'];
export const CLAIM_CYCLES = ['weekly', 'monthly', 'quarterly', 'on_demand'];
export const CLAIM_STATUSES = ['draft', 'submitted', 'partially_paid', 'paid', 'rejected'];
export const AGING_BUCKETS = ['0_30', '31_60', '61_90', '90_plus'];

export const claimStatusCls = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  submitted: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60',
  partially_paid: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
};

export const pillCls = 'inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold';

export const thCls = 'px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400';
export const tdCls = 'px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300';

// yyyy-mm-dd for <input type="date">
export const toDateInput = (d) => {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

export const firstOfMonth = () => {
  const d = new Date();
  return toDateInput(new Date(d.getFullYear(), d.getMonth(), 1));
};
