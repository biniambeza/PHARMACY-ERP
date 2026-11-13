import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MetricCardSkeleton, CardSkeleton } from '../common/SkeletonLoader';
import { money, th } from './reportUtils';

export const CardTitle = ({ icon: Icon, title, subtitle, tone = 'emerald', right }) => {
  const tones = {
    emerald: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/80 dark:border-emerald-800/60 text-emerald-600 dark:text-emerald-400',
    indigo: 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200/80 dark:border-indigo-800/60 text-indigo-600 dark:text-indigo-400',
    amber: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200/80 dark:border-amber-800/60 text-amber-600 dark:text-amber-400',
    rose: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200/80 dark:border-rose-800/60 text-rose-600 dark:text-rose-400',
  };
  return (
    <div className="flex items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-100 dark:border-slate-800/80">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${tones[tone]}`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
};

export const Stat = ({ label, value, sub, tone = 'slate' }) => {
  const tones = {
    slate: 'text-slate-900 dark:text-white',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    rose: 'text-rose-600 dark:text-rose-400',
    amber: 'text-amber-600 dark:text-amber-400',
  };
  return (
    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">{label}</p>
      <p className={`mt-1 font-mono font-bold text-lg ${tones[tone]}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
};

export const Empty = ({ children }) => <div className="py-12 text-center text-xs text-slate-400">{children}</div>;

export const ErrorBox = ({ message, onRetry }) => {
  const { t } = useTranslation('reports');
  return (
    <div className="p-8 bg-white dark:bg-[#161c26] rounded-2xl border border-rose-200 dark:border-rose-900/50 text-center space-y-3 max-w-2xl mx-auto">
      <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{message}</p>
      <button onClick={onRetry} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl cursor-pointer">
        {t('retry')}
      </button>
    </div>
  );
};

export const Loading = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCardSkeleton />
      <MetricCardSkeleton />
      <MetricCardSkeleton />
      <MetricCardSkeleton />
    </div>
    <CardSkeleton height="h-80" />
  </div>
);

// Generic table used by every tab: columns [{ key, header, align, render?, format? }]
export const DataTableSimple = ({ columns, rows, empty }) => {
  const { t } = useTranslation('reports');
  return rows.length === 0 ? (
    <Empty>{empty ?? t('noDataPeriod')}</Empty>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-100 dark:border-slate-800">
            {columns.map((c) => (
              <th key={c.header} className={`${th} ${c.align === 'right' ? 'text-right' : ''}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100/80 dark:divide-slate-800/60 font-medium">
          {rows.map((row, i) => (
            <tr key={row.id || row._id || i} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
              {columns.map((c) => (
                <td
                  key={c.header}
                  className={`py-2.5 pr-2 text-slate-700 dark:text-slate-300 ${c.align === 'right' ? 'text-right font-mono' : ''}`}
                >
                  {c.render ? c.render(row) : c.format ? c.format(row[c.key], row) : row[c.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const ChartTooltip = ({ active, payload, label }) => {
  const { t } = useTranslation('reports');
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white dark:bg-slate-900 text-xs p-3 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800">
      <div className="font-semibold text-slate-600 dark:text-slate-300 mb-1">
        {label} {d?.date && <span className="font-mono text-[10px] text-slate-400 ml-2">{d.date}</span>}
      </div>
      <p className="font-mono text-emerald-600 dark:text-emerald-400 font-bold text-sm">{money(payload[0].value)}</p>
      {d?.orderCount !== undefined && <p className="text-[11px] text-slate-500">{t('ordersCount', { count: d.orderCount })}</p>}
    </div>
  );
};
