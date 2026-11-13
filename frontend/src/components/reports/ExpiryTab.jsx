import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarX, ShieldAlert } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getExpiryLoss } from '../../api/reportApi';
import { card, money, useReport, EN } from './reportUtils';
import { CardTitle, Stat, Empty, ErrorBox, Loading, DataTableSimple } from './ReportUi';

const ExpiryTab = ({ range, rangeKey, onExportSpec }) => {
  const { t } = useTranslation('reports');
  const { data, loading, error, reload } = useReport(() => getExpiryLoss(range), rangeKey);
  const report = data?.report;

  useEffect(() => {
    if (!report) return;
    onExportSpec({
      title: t('expiry.exportTitle'),
      fileTitle: t('expiry.exportTitle', EN),
      columns: [
        { key: 'month', header: t('cols.month') },
        { key: 'batches', header: t('cols.batches'), align: 'right' },
        { key: 'units', header: t('cols.units'), align: 'right' },
        { key: 'value', header: t('cols.lossAtCost'), align: 'right', format: money },
      ],
      rows: report.byMonth,
      summary: [
        [t('expiry.totalWrittenOff'), money(report.totals.value)],
        [
          t('expiry.expiredOnShelf'),
          t('expiry.expiredOnShelfValue', { value: money(report.expiredOnShelf.value), batches: report.expiredOnShelf.batches }),
        ],
      ],
    });
  }, [report, onExportSpec, t]);

  if (loading && !report) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!report) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat
          label={t('expiry.writtenOff')}
          value={money(report.totals.value)}
          sub={t('expiry.writtenOffSub', { units: report.totals.units, batches: report.totals.batches })}
          tone="rose"
        />
        <Stat
          label={t('expiry.notWrittenOff')}
          value={money(report.expiredOnShelf.value)}
          sub={t('expiry.notWrittenOffSub', { units: report.expiredOnShelf.units, batches: report.expiredOnShelf.batches })}
          tone="amber"
        />
        <Stat label={t('expiry.period')} value={report.rangeLabel} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className={`lg:col-span-7 ${card}`}>
          <CardTitle icon={CalendarX} tone="rose" title={t('expiry.byMonth')} subtitle={t('expiry.byMonthSub')} />
          {report.byMonth.length === 0 ? (
            <Empty>{t('expiry.noneWrittenOff')}</Empty>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.byMonth}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.15} />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={60} />
                  <Tooltip formatter={(v) => money(v)} />
                  <Bar dataKey="value" name={t('cols.loss')} fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className={`lg:col-span-5 ${card}`}>
          <CardTitle icon={ShieldAlert} tone="amber" title={t('expiry.biggest')} subtitle={t('expiry.biggestSub')} />
          <DataTableSimple
            rows={report.byMedicine}
            empty={t('expiry.noLosses')}
            columns={[
              { key: 'name', header: t('cols.medicine') },
              { key: 'units', header: t('cols.units'), align: 'right' },
              { key: 'value', header: t('cols.loss'), align: 'right', format: money },
            ]}
          />
        </div>
      </div>
    </div>
  );
};

export default ExpiryTab;
