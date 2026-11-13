import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import StatusBadge from '../common/StatusBadge';
import { panelCls } from './panel';

const LegendRow = ({ dotCls, label, value }) => (
  <div className="flex justify-between items-center">
    <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
      <span className={`w-2 h-2 rounded-full ${dotCls}`} /> {label}
    </span>
    <span className="font-bold text-slate-900 dark:text-white">{value || 0}</span>
  </div>
);

/** FEFO expiry donut chart. */
const ExpiryHealthCard = ({ batchOverview }) => {
  const { t } = useTranslation(['dashboard', 'common']);

  return (
    <div className={panelCls}>
      <div>
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800/80">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('expiry.title')}</h3>
          <StatusBadge status="healthy" label={t('expiry.monitored')} size="sm" />
        </div>

        <div className="flex items-center gap-5 my-3">
          {/* Donut representation */}
          <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="38" stroke="currentColor" strokeWidth="12" fill="none" className="text-slate-100 dark:text-slate-800" />
              <circle
                cx="50"
                cy="50"
                r="38"
                stroke="#10b981"
                strokeWidth="12"
                fill="none"
                strokeDasharray={`${Math.max(1, (batchOverview.onTrackPct / 100) * 238)} 240`}
                strokeDashoffset="0"
              />
              <circle
                cx="50"
                cy="50"
                r="38"
                stroke="#f59e0b"
                strokeWidth="12"
                fill="none"
                strokeDasharray={`${Math.max(1, (batchOverview.atRiskPct / 100) * 238)} 240`}
                strokeDashoffset={`-${(batchOverview.onTrackPct / 100) * 238}`}
              />
              <circle
                cx="50"
                cy="50"
                r="38"
                stroke="#ef4444"
                strokeWidth="12"
                fill="none"
                strokeDasharray={`${Math.max(1, (batchOverview.delayedPct / 100) * 238)} 240`}
                strokeDashoffset={`-${((batchOverview.onTrackPct + batchOverview.atRiskPct) / 100) * 238}`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-[9px] text-slate-400 uppercase font-bold">{t('common:labels.total')}</span>
              <span className="text-base font-extrabold text-slate-900 dark:text-white">{batchOverview.total || 0}</span>
            </div>
          </div>

          {/* Legend List */}
          <div className="space-y-1.5 text-xs flex-1">
            <LegendRow dotCls="bg-emerald-500" label={t('expiry.healthy')} value={batchOverview.onTrack} />
            <LegendRow dotCls="bg-amber-500" label={t('expiry.warning')} value={batchOverview.atRisk} />
            <LegendRow dotCls="bg-rose-500" label={t('expiry.critical')} value={batchOverview.delayed} />
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80">
        <Link
          to="/pharmacy/stock"
          className="w-full block text-center py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 rounded-xl transition"
        >
          {t('expiry.audit')}
        </Link>
      </div>
    </div>
  );
};

export default ExpiryHealthCard;
