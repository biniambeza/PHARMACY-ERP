import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Percent } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getProfitReport } from '../../api/reportApi';
import { card, money, useReport, EN } from './reportUtils';
import { CardTitle, Stat, ErrorBox, Loading, DataTableSimple } from './ReportUi';

const GROUP_LABEL_KEYS = { medicine: 'profit.groupMedicine', category: 'profit.groupCategory' };
const TITLE_KEYS = { medicine: 'profit.titleByMedicine', category: 'profit.titleByCategory' };

const ProfitTab = ({ range, rangeKey, onExportSpec }) => {
  const { t } = useTranslation('reports');
  const [groupBy, setGroupBy] = useState('medicine');
  const { data, loading, error, reload } = useReport(() => getProfitReport(range, groupBy), `${rangeKey}|${groupBy}`);
  const report = data?.report;

  const columns = useMemo(
    () => [
      { key: 'name', header: groupBy === 'category' ? t('cols.category') : t('cols.medicine') },
      ...(groupBy === 'medicine'
        ? [{ key: 'category', header: t('cols.category') }]
        : [{ key: 'medicines', header: t('cols.medicines'), align: 'right' }]),
      { key: 'unitsSold', header: t('cols.unitsNet'), align: 'right' },
      { key: 'revenue', header: t('cols.netRevenue'), align: 'right', format: money },
      { key: 'cogs', header: t('cols.cogs'), align: 'right', format: money },
      { key: 'profit', header: t('cols.profit'), align: 'right', format: money },
      { key: 'marginPct', header: t('cols.margin'), align: 'right', format: (v) => `${v}%` },
    ],
    [groupBy, t]
  );

  useEffect(() => {
    if (!report) return;
    onExportSpec({
      title: t(TITLE_KEYS[groupBy]),
      fileTitle: t(TITLE_KEYS[groupBy], EN),
      columns,
      rows: report.rows,
      summary: [
        [t('cols.netRevenue'), money(report.totals.revenue)],
        [t('cols.cogs'), money(report.totals.cogs)],
        [t('cols.profit'), `${money(report.totals.profit)} (${report.totals.marginPct}%)`],
      ],
    });
  }, [report, columns, groupBy, onExportSpec, t]);

  if (loading && !report) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!report) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Stat label={t('profit.netRevenue')} value={money(report.totals.revenue)} />
        <Stat label={t('profit.costOfGoods')} value={money(report.totals.cogs)} tone="amber" />
        <Stat label={t('profit.grossProfit')} value={money(report.totals.profit)} tone={report.totals.profit >= 0 ? 'emerald' : 'rose'} />
        <Stat label={t('profit.margin')} value={`${report.totals.marginPct}%`} sub={t('profit.unitsSold', { count: report.totals.unitsSold })} />
      </div>
      <div className={card}>
        <CardTitle
          icon={Percent}
          title={t(TITLE_KEYS[groupBy])}
          subtitle={t('profit.subtitle')}
          right={
            <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-[11px]">
              {['medicine', 'category'].map((g) => (
                <button
                  key={g}
                  onClick={() => setGroupBy(g)}
                  className={`px-3 py-1.5 rounded-lg capitalize cursor-pointer ${
                    groupBy === g ? 'bg-white dark:bg-[#161c26] text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {t(GROUP_LABEL_KEYS[g])}
                </button>
              ))}
            </div>
          }
        />
        {report.rows.length > 0 && (
          <div className="h-64 w-full mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.rows.slice(0, 10)} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.15} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} interval={0} tickFormatter={(v) => String(v).slice(0, 12)} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={60} />
                <Tooltip formatter={(v) => money(v)} />
                <Bar dataKey="revenue" name={t('cols.revenue')} fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="profit" name={t('cols.profit')} fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <DataTableSimple columns={columns} rows={report.rows} />
      </div>
    </div>
  );
};

export default ProfitTab;
