import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { GitCompare, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { getPeriodComparison } from '../../api/reportApi';
import { formatDate } from '../../utils/format';
import { card, money, pct, useReport, EN } from './reportUtils';
import { CardTitle, Empty, ErrorBox, Loading, DataTableSimple } from './ReportUi';

// metric key -> is it a money value?
const COMPARE_METRICS = {
  revenue: true,
  netRevenue: true,
  grossProfit: true,
  cogs: true,
  orders: false,
  avgTicket: true,
  tax: true,
  refunds: true,
  unitsSold: false,
};
const GOOD_WHEN_DOWN = new Set(['cogs', 'refunds']);
// `to` is exclusive on the server; show the last included day.
const lastDay = (to) => formatDate(new Date(new Date(to).getTime() - 1));

const CompareTab = ({ range, rangeKey, onExportSpec }) => {
  const { t } = useTranslation('reports');
  const { data, loading, error, reload } = useReport(() => getPeriodComparison(range), rangeKey);
  const report = data?.report;
  const rows = useMemo(
    () =>
      report
        ? Object.entries(report.comparison).map(([key, v]) => ({
            id: key,
            metric: key in COMPARE_METRICS ? t(`compare.metrics.${key}`) : key,
            isMoney: COMPARE_METRICS[key],
            ...v,
          }))
        : [],
    [report, t]
  );

  useEffect(() => {
    if (!report) return;
    const fmt = (v, r) => (r.isMoney ? money(v) : v);
    onExportSpec({
      title: t('compare.exportTitle'),
      fileTitle: t('compare.exportTitle', EN),
      columns: [
        { key: 'metric', header: t('cols.metric') },
        { key: 'current', header: t('cols.thisPeriod'), align: 'right', format: fmt },
        { key: 'previous', header: t('cols.previousPeriod'), align: 'right', format: fmt },
        { key: 'changePct', header: t('cols.change'), align: 'right', format: (v) => pct(v, t('na')) },
      ],
      rows,
      summary: [
        [t('compare.thisPeriod'), `${formatDate(report.from)} - ${lastDay(report.to)}`],
        [t('compare.previousPeriod'), `${formatDate(report.previous?.from)} - ${lastDay(report.previous?.to)}`],
      ],
    });
  }, [report, rows, onExportSpec, t]);

  if (range.range === 'all') return <Empty>{t('compare.chooseBounded')}</Empty>;
  if (loading && !report) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!report) return null;

  return (
    <div className={card}>
      <CardTitle
        icon={GitCompare}
        tone="indigo"
        title={t('compare.title', { range: report.rangeLabel })}
        subtitle={t('compare.subtitle', {
          from: formatDate(report.from),
          to: lastDay(report.to),
          prevFrom: formatDate(report.previous?.from),
          prevTo: lastDay(report.previous?.to),
        })}
      />
      <DataTableSimple
        rows={rows}
        columns={[
          { key: 'metric', header: t('cols.metric') },
          { key: 'current', header: t('cols.thisPeriod'), align: 'right', render: (r) => (r.isMoney ? money(r.current) : r.current) },
          { key: 'previous', header: t('cols.previous'), align: 'right', render: (r) => (r.isMoney ? money(r.previous) : r.previous) },
          {
            key: 'changePct',
            header: t('cols.change'),
            align: 'right',
            render: (r) => {
              if (r.changePct === null || r.changePct === undefined) return <span className="text-slate-400">{t('na')}</span>;
              const up = r.changePct >= 0;
              const good = GOOD_WHEN_DOWN.has(r.id) ? !up : up;
              const Icon = up ? ArrowUpRight : ArrowDownRight;
              return (
                <span className={`inline-flex items-center gap-0.5 font-bold ${good ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  <Icon className="w-3.5 h-3.5" />
                  {pct(r.changePct)}
                </span>
              );
            },
          },
        ]}
      />
    </div>
  );
};

export default CompareTab;
