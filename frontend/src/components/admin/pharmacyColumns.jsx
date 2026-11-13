import StatusBadge from '../common/StatusBadge';
import { formatDate } from '../../utils/format';

const SUB_BADGE = { trial: 'pending', active: 'active', past_due: 'warning', cancelled: 'cancelled' };

const statusLabel = (t, status) =>
  status === 'active'
    ? t('status.active', { ns: 'common' })
    : status === 'archived'
    ? t('status.archived', { ns: 'common' })
    : t('status.suspended', { ns: 'common' });

// DataTable column config for the admin pharmacies table.
// `t` must come from useTranslation('admin').
export const buildPharmacyColumns = ({
  t,
  actionLoading,
  onViewDetails,
  onBilling,
  onSupport,
  onToggleStatus,
  onArchive,
}) => [
  {
    header: t('dashboard.columns.pharmacyLicense'),
    key: 'name',
    render: (item) => (
      <div>
        <button
          onClick={() => onViewDetails(item)}
          className="font-bold text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 text-left transition cursor-pointer block"
        >
          {item.name}
        </button>
        <span className="inline-block mt-0.5 text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
          {t('dashboard.licenseShort', { licenseNo: item.licenseNo })}
        </span>
      </div>
    ),
  },
  {
    header: t('dashboard.columns.ownerEmail'),
    key: 'owner',
    render: (item) => (
      <div>
        <span className="font-semibold text-slate-800 dark:text-slate-200 block">
          {item.owner?.name || t('dashboard.unassigned')}
        </span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono block">
          {item.owner?.email || t('shared.na')}
        </span>
      </div>
    ),
  },
  {
    header: t('dashboard.columns.activeBatches'),
    key: 'activeBatches',
    render: (item) => (
      <div>
        <span className="font-extrabold text-slate-900 dark:text-white block">
          {t('dashboard.lots', { count: item.activeBatches || 0 })}
        </span>
        <span className="text-[10px] text-slate-400 block">
          {t('dashboard.salesRecorded', { count: item.totalSales || 0 })}
        </span>
      </div>
    ),
  },
  {
    header: t('dashboard.columns.createdDate'),
    key: 'createdAt',
    render: (item) => (
      <span className="text-slate-600 dark:text-slate-400 text-[11px] font-mono">
        {item.createdAt
          ? new Date(item.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : t('shared.na')}
      </span>
    ),
  },
  {
    header: t('dashboard.columns.subscription'),
    key: 'subscription',
    render: (item) => {
      const sub = item.subscription || {};
      const end = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
      const overdue = end && end.getTime() < Date.now();
      return (
        <button onClick={() => onBilling(item)} title={t('dashboard.editSubscription')} className="text-left cursor-pointer group">
          <span className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-800 dark:text-slate-200 capitalize group-hover:text-emerald-600">
              {sub.plan || 'standard'}
            </span>
            <StatusBadge
              status={SUB_BADGE[sub.status] || 'active'}
              label={SUB_BADGE[sub.status] ? t(`dashboard.subStatus.${sub.status}`) : t('dashboard.subStatus.active')}
              size="sm"
              dot={false}
            />
          </span>
          <span className={`text-[10px] block mt-0.5 ${overdue ? 'text-rose-500 font-semibold' : 'text-slate-400'}`}>
            {end
              ? t(overdue ? 'dashboard.ended' : 'dashboard.renews', { date: formatDate(end) })
              : t('shared.noExpiry')}
          </span>
        </button>
      );
    },
  },
  {
    header: t('shared.status'),
    key: 'status',
    render: (item) => <StatusBadge status={item.status} label={statusLabel(t, item.status)} size="sm" />,
  },
  {
    header: t('labels.actions', { ns: 'common' }),
    key: 'actions',
    align: 'right',
    render: (item) => (
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => onViewDetails(item)}
          className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition cursor-pointer"
        >
          {t('dashboard.details')}
        </button>
        <button
          onClick={() => onBilling(item)}
          className="px-2.5 py-1 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800/60 rounded-lg transition cursor-pointer"
        >
          {t('dashboard.billing')}
        </button>
        <button
          onClick={() => onSupport(item)}
          title={t('dashboard.viewAsSupportTitle')}
          className="px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 border border-sky-200 dark:border-sky-800/60 rounded-lg transition cursor-pointer"
        >
          {t('dashboard.viewAsSupport')}
        </button>
        <button
          onClick={() => onToggleStatus(item._id)}
          disabled={actionLoading === item._id}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer border ${
            item.status === 'active'
              ? 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 border-amber-200 dark:border-amber-800/60'
              : 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 border-emerald-200 dark:border-emerald-800/60'
          }`}
        >
          {actionLoading === item._id
            ? '...'
            : item.status === 'active'
            ? t('dashboard.suspend')
            : t('dashboard.activate')}
        </button>
        <button
          onClick={() => onArchive(item._id, item.name)}
          disabled={actionLoading === item._id}
          title={t('dashboard.archiveTitle')}
          className="px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 border border-rose-200 dark:border-rose-800/60 rounded-lg transition cursor-pointer"
        >
          {t('dashboard.archive')}
        </button>
      </div>
    ),
  },
];
