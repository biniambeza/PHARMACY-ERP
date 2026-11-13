import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DollarSign, Award, PieChart as PieIcon, BarChart3, Percent, ShieldAlert, Receipt, Layers, Clock, Wallet } from 'lucide-react';
import { AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getFinancialAnalytics } from '../../api/reportApi';
import MetricCard from '../common/MetricCard';
import StatusBadge from '../common/StatusBadge';
import { PAYMENT_META, card, money, pct, useReport, EN } from './reportUtils';
import { CardTitle, Stat, ErrorBox, Loading, DataTableSimple, ChartTooltip } from './ReportUi';

const OverviewTab = ({ range, rangeKey, onExportSpec }) => {
  const { t } = useTranslation('reports');
  const { data, loading, error, reload } = useReport(() => getFinancialAnalytics(range), rangeKey);
  const analytics = data?.analytics;

  useEffect(() => {
    if (!analytics) return;
    const f = analytics.financials;
    onExportSpec({
      title: t('overview.exportTitle'),
      fileTitle: t('overview.exportTitle', EN),
      columns: [
        { key: 'name', header: t('cols.medicine') },
        { key: 'unitsSold', header: t('cols.unitsSold'), align: 'right' },
        { key: 'revenue', header: t('cols.netRevenue'), align: 'right', format: money },
        { key: 'cogs', header: t('cols.cogs'), align: 'right', format: money },
        { key: 'estimatedProfit', header: t('cols.profit'), align: 'right', format: money },
      ],
      rows: analytics.topMedicines,
      summary: [
        [t('overview.sumRevenue'), money(f.totalRevenue)],
        [t('overview.sumRefunds'), money(f.refunds)],
        [t('overview.sumTax'), money(f.taxTotal)],
        [t('overview.sumCogs'), money(f.totalCOGS)],
        [t('overview.sumGrossProfit'), `${money(f.grossProfit)} (${f.profitMargin}%)`],
        [t('overview.sumOrders'), f.totalOrders],
        ...Object.entries(analytics.paymentMethods).map(([k, v]) => [
          t('overview.paidBy', { method: t(`payment.${k}`, { defaultValue: k }) }),
          `${money(v.total)} (${v.count})`,
        ]),
      ],
    });
  }, [analytics, onExportSpec, t]);

  if (loading && !analytics) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!analytics) return null;

  const { financials, paymentMethods, dailyTrend, topMedicines, expiryRisk, comparison } = analytics;
  const series = dailyTrend.map((d) => d.revenue);
  const change = (k, invert = false) => {
    const v = comparison?.[k]?.changePct;
    if (v === null || v === undefined) return { change: t('na'), changeType: 'neutral' };
    const good = invert ? v <= 0 : v >= 0;
    return { change: pct(v), changeType: good ? 'positive' : 'negative' };
  };
  const paymentRows = Object.entries(paymentMethods).map(([k, v]) => ({
    key: k,
    ...(PAYMENT_META[k] || { color: '#94a3b8', icon: Wallet }),
    label: t(`payment.${k}`, { defaultValue: k.replace(/_/g, ' ') }),
    ...v,
  }));
  const pieData = paymentRows.filter((p) => p.total > 0);
  const tenderTotal = paymentRows.reduce((s, p) => s + p.total, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <MetricCard
          title={t('overview.revenue')}
          value={money(financials.totalRevenue)}
          {...change('revenue')}
          subValue={t('overview.revenueSub', { range: analytics.rangeLabel, refunds: money(financials.refunds) })}
          badgeText={t('overview.inflow')}
          badgeVariant="emerald"
          icon={<DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
          sparklineData={series}
          sparklineColor="#10b981"
          sparklineId="rep-rev-spark"
        />
        <MetricCard
          title={t('overview.cogsTitle')}
          value={money(financials.totalCOGS)}
          {...change('cogs', true)}
          subValue={t('overview.cogsSub')}
          badgeText={t('overview.cost')}
          badgeVariant="amber"
          icon={<Layers className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
          sparklineData={series}
          sparklineColor="#f59e0b"
          sparklineId="rep-cogs-spark"
        />
        <MetricCard
          title={t('overview.grossProfit')}
          value={money(financials.grossProfit)}
          {...change('grossProfit')}
          subValue={t('overview.marginSub', { margin: Number(financials.profitMargin || 0).toFixed(1) })}
          badgeText={financials.grossProfit >= 0 ? t('overview.profit') : t('overview.loss')}
          badgeVariant={financials.grossProfit >= 0 ? 'emerald' : 'rose'}
          icon={<Percent className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
          sparklineData={series}
          sparklineColor="#10b981"
          sparklineId="rep-margin-spark"
        />
        <MetricCard
          title={t('overview.transactions')}
          value={String(financials.totalOrders || 0)}
          {...change('orders')}
          subValue={t('overview.avgTicketSub', { amount: money(financials.avgTicket) })}
          badgeText={t('overview.volume')}
          badgeVariant="indigo"
          icon={<Receipt className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
          sparklineData={dailyTrend.map((d) => d.orderCount)}
          sparklineColor="#6366f1"
          sparklineId="rep-trans-spark"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className={`lg:col-span-8 ${card}`}>
          <CardTitle icon={BarChart3} title={t('overview.velocity', { range: analytics.rangeLabel })} subtitle={t('overview.velocitySub')} />
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.15} />
                <XAxis dataKey="dayName" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} minTickGap={12} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={60} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2.5} fill="url(#revenueFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={`lg:col-span-4 ${card}`}>
          <CardTitle icon={PieIcon} tone="indigo" title={t('overview.tender')} subtitle={t('overview.tenderSub')} />
          <div className="h-44 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData.length ? pieData : [{ label: t('overview.none'), total: 1, color: '#e2e8f0' }]}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={4}
                  dataKey="total"
                >
                  {(pieData.length ? pieData : [{ color: '#e2e8f0' }]).map((p, i) => (
                    <Cell key={i} fill={p.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] uppercase font-bold text-slate-400">{t('overview.totalTender')}</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">{money(tenderTotal)}</span>
            </div>
          </div>
          <div className="space-y-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs">
            {paymentRows.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5" style={{ color: p.color }} />
                    <span className="text-slate-700 dark:text-slate-300">{p.label}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-slate-400 text-[11px]">{t('overview.txCount', { count: p.count })}</span>
                    <span className="font-bold text-slate-900 dark:text-white">{money(p.total)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className={`lg:col-span-7 ${card}`}>
          <CardTitle icon={Award} tone="amber" title={t('overview.topMedicines', { range: analytics.rangeLabel })} subtitle={t('overview.topMedicinesSub')} />
          <DataTableSimple
            rows={topMedicines}
            empty={t('overview.noProductSales')}
            columns={[
              { header: '#', render: (r) => topMedicines.indexOf(r) + 1 },
              { header: t('cols.medicine'), key: 'name' },
              { header: t('cols.units'), key: 'unitsSold', align: 'right' },
              { header: t('cols.revenue'), key: 'revenue', align: 'right', format: money },
              {
                header: t('cols.profit'),
                align: 'right',
                render: (r) => (
                  <span className={r.estimatedProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-rose-600 font-bold'}>
                    {money(r.estimatedProfit)}
                  </span>
                ),
              },
            ]}
          />
        </div>

        <div className={`lg:col-span-5 ${card}`}>
          <CardTitle
            icon={ShieldAlert}
            tone={expiryRisk.expiringBatchesCount > 0 ? 'rose' : 'emerald'}
            title={t('overview.expiryRisk')}
            subtitle={t('overview.expiryRiskSub')}
            right={
              <StatusBadge
                status={expiryRisk.expiringBatchesCount > 0 ? 'critical' : 'healthy'}
                label={expiryRisk.expiringBatchesCount > 0 ? t('overview.warning') : t('overview.compliant')}
              />
            }
          />
          <div className="space-y-3">
            <Stat label={t('overview.atRiskBatches')} value={expiryRisk.expiringBatchesCount} />
            <div className="grid grid-cols-2 gap-3">
              <Stat label={t('overview.valueAtCost')} value={money(expiryRisk.riskValueCost)} tone="amber" />
              <Stat label={t('overview.valueAtRetail')} value={money(expiryRisk.riskValueRetail)} tone="rose" />
            </div>
            <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-xl border border-emerald-200/80 dark:border-emerald-900/40 text-xs text-emerald-800 dark:text-emerald-300">
              <p className="font-bold flex items-center gap-1.5 mb-1">
                <Clock className="w-3.5 h-3.5" /> {t('overview.fefo')}
              </p>
              <p className="text-[11px] leading-relaxed">{t('overview.fefoText')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewTab;
