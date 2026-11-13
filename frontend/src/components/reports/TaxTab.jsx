import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Landmark, Receipt } from 'lucide-react';
import { getTaxSummary } from '../../api/reportApi';
import { card, money, useReport, EN } from './reportUtils';
import { CardTitle, Stat, ErrorBox, Loading, DataTableSimple } from './ReportUi';

const TaxTab = ({ range, rangeKey, onExportSpec }) => {
  const { t } = useTranslation('reports');
  const { data, loading, error, reload } = useReport(() => getTaxSummary(range), rangeKey);
  const report = data?.report;

  const columns = useMemo(
    () => [
      { key: 'period', header: report?.groupBy === 'month' ? t('cols.month') : t('cols.day') },
      { key: 'sales', header: t('cols.sales'), align: 'right' },
      { key: 'grossSales', header: t('cols.grossSales'), align: 'right', format: money },
      { key: 'taxableSales', header: t('cols.taxableNet'), align: 'right', format: money },
      {
        key: 'lines',
        header: t('cols.breakdown'),
        format: (v) => (v || []).map((l) => `${l.name} ${l.rate}%: ${money(l.amount)}`).join('; ') || '—',
      },
      { key: 'tax', header: t('cols.tax'), align: 'right', format: money },
    ],
    [report?.groupBy, t]
  );

  useEffect(() => {
    if (!report) return;
    onExportSpec({
      title: t('tax.exportTitle'),
      fileTitle: t('tax.exportTitle', EN),
      columns,
      rows: report.periods,
      summary: [
        [t('tax.totalTax'), money(report.totals.tax)],
        [t('tax.taxableSales'), money(report.totals.taxableSales)],
        ...report.byRate.map((r) => [`${r.name} ${r.rate}%`, money(r.amount)]),
      ],
    });
  }, [report, columns, onExportSpec, t]);

  if (loading && !report) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!report) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label={t('tax.taxCollected')} value={money(report.totals.tax)} tone="emerald" />
        <Stat label={t('tax.taxableSalesNet')} value={money(report.totals.taxableSales)} />
        <Stat
          label={t('tax.grossSales')}
          value={money(report.totals.grossSales)}
          sub={report.totals.untrackedTax > 0 ? t('tax.enteredManually', { amount: money(report.totals.untrackedTax) }) : null}
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className={`lg:col-span-4 ${card}`}>
          <CardTitle icon={Landmark} tone="indigo" title={t('tax.byRate')} />
          <DataTableSimple
            rows={report.byRate}
            empty={t('tax.noItemized')}
            columns={[
              { key: 'name', header: t('cols.tax') },
              { key: 'rate', header: t('cols.rate'), align: 'right', format: (v) => `${v}%` },
              { key: 'sales', header: t('cols.sales'), align: 'right' },
              { key: 'amount', header: t('cols.amount'), align: 'right', format: money },
            ]}
          />
        </div>
        <div className={`lg:col-span-8 ${card}`}>
          <CardTitle
            icon={Receipt}
            title={t(`tax.per_${report.groupBy}`, { defaultValue: t('tax.perGeneric', { group: report.groupBy }) })}
            subtitle={t('tax.perSub')}
          />
          <DataTableSimple columns={columns} rows={report.periods} />
        </div>
      </div>
    </div>
  );
};

export default TaxTab;
