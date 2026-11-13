import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive } from 'lucide-react';
import { getSlowMovingStock } from '../../api/reportApi';
import StatusBadge from '../common/StatusBadge';
import { CardSkeleton } from '../common/SkeletonLoader';
import { formatDate } from '../../utils/format';
import { card, money, useReport, EN } from './reportUtils';
import { CardTitle, Stat, ErrorBox, DataTableSimple } from './ReportUi';

const selectCls = 'px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300';

const SlowTab = ({ onExportSpec }) => {
  const { t } = useTranslation('reports');
  const [days, setDays] = useState(90);
  const [status, setStatus] = useState('all');
  const { data, loading, error, reload } = useReport(() => getSlowMovingStock(days, status), `${days}|${status}`);
  const report = data?.report;

  const columns = useMemo(
    () => [
      { key: 'name', header: t('cols.medicine') },
      { key: 'category', header: t('cols.category') },
      {
        key: 'status',
        header: t('cols.status'),
        render: (r) => (
          <StatusBadge status={r.status === 'dead' ? 'critical' : 'warning'} label={r.status === 'dead' ? t('slow.dead') : t('slow.slow')} size="sm" />
        ),
        format: (v) => v,
      },
      { key: 'quantity', header: t('cols.inStock'), align: 'right' },
      { key: 'stockValue', header: t('cols.stockValue'), align: 'right', format: money },
      { key: 'unitsSoldInWindow', header: t('cols.soldInWindow', { days }), align: 'right' },
      { key: 'daysSinceLastSale', header: t('cols.daysSinceSale'), align: 'right', format: (v) => (v === null ? t('slow.never') : v) },
      { key: 'nearestExpiry', header: t('cols.nearestExpiry'), format: (v) => formatDate(v) },
    ],
    [days, t]
  );

  useEffect(() => {
    if (!report) return;
    onExportSpec({
      title: t('slow.exportTitle', { days }),
      fileTitle: t('slow.exportTitle', { days, ...EN }),
      columns: columns.map(({ render, ...c }) => c), // eslint-disable-line no-unused-vars
      rows: report.rows,
      summary: [
        [t('slow.deadStock'), t('slow.itemsValue', { count: report.summary.dead.count, value: money(report.summary.dead.stockValue) })],
        [t('slow.slowMovers'), t('slow.itemsValue', { count: report.summary.slow.count, value: money(report.summary.slow.stockValue) })],
      ],
    });
  }, [report, columns, days, onExportSpec, t]);

  return (
    <div className="space-y-6">
      <div className={card}>
        <CardTitle
          icon={Archive}
          tone="amber"
          title={t('slow.title')}
          subtitle={t('slow.subtitle')}
          right={
            <div className="flex items-center gap-2 text-xs">
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={selectCls}>
                {[30, 60, 90, 180, 365].map((d) => (
                  <option key={d} value={d}>
                    {t('slow.days', { count: d })}
                  </option>
                ))}
              </select>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
                <option value="all">{t('slow.all')}</option>
                <option value="dead">{t('slow.deadOnly')}</option>
                <option value="slow">{t('slow.slowOnly')}</option>
              </select>
            </div>
          }
        />
        {loading && !report ? (
          <CardSkeleton height="h-64" />
        ) : error ? (
          <ErrorBox message={error} onRetry={reload} />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <Stat
                label={t('slow.deadStock')}
                value={money(report.summary.dead.stockValue)}
                sub={t('slow.medicinesTiedUp', { count: report.summary.dead.count })}
                tone="rose"
              />
              <Stat
                label={t('slow.slowMovers')}
                value={money(report.summary.slow.stockValue)}
                sub={t('slow.medicinesCount', { count: report.summary.slow.count })}
                tone="amber"
              />
            </div>
            <DataTableSimple columns={columns} rows={report.rows} empty={t('slow.empty')} />
          </>
        )}
      </div>
    </div>
  );
};

export default SlowTab;
