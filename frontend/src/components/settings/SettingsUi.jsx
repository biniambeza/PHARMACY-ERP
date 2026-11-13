import { CheckCircle2, AlertCircle } from 'lucide-react';

export const Alert = ({ type, children }) =>
  type === 'success' ? (
    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
      <CheckCircle2 className="w-4 h-4 shrink-0" />
      <span>{children}</span>
    </div>
  ) : (
    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
      <AlertCircle className="w-4 h-4 shrink-0" />
      <span>{children}</span>
    </div>
  );

const HEADER_COLORS = {
  emerald: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400',
  cyan: 'bg-cyan-50 dark:bg-cyan-950/50 text-cyan-600 dark:text-cyan-400',
  indigo: 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400',
  amber: 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400',
};

export const CardHeader = ({ icon: Icon, color = 'emerald', title, subtitle }) => (
  <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${HEADER_COLORS[color]}`}>
      <Icon className="w-5 h-5" />
    </div>
    <div>
      <h2 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h2>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p>
    </div>
  </div>
);

export const Toggle = ({ checked, onChange, label, hint }) => (
  <label className="flex items-start gap-3 cursor-pointer select-none">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 w-4 h-4 accent-emerald-600" />
    <span>
      <span className="block font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {hint && <span className="block text-[10px] text-slate-400">{hint}</span>}
    </span>
  </label>
);

/** Segmented button group (e.g. tax pricing mode, receipt width). */
export const OptionButtons = ({ options, value, onChange, extraCls = '' }) => (
  <div className="flex gap-2">
    {options.map((o) => (
      <button
        key={String(o.value)}
        type="button"
        onClick={() => onChange(o.value)}
        className={`flex-1 px-3 py-2 rounded-xl border transition cursor-pointer ${extraCls}${extraCls ? ' ' : ''}${
          value === o.value
            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold'
            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);
