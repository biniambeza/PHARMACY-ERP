import { useTranslation } from 'react-i18next';
import MetricCard from '../common/MetricCard';
import { formatMoney } from '../../utils/format';

const growthType = (g, invert = false) => {
  if (!g || g === 'n/a') return 'neutral';
  const up = !String(g).startsWith('-');
  return (invert ? !up : up) ? 'positive' : 'negative';
};

/** Top row of four executive KPI cards. */
const KpiCards = ({ kpis, period, revenueVsExpenses }) => {
  const { t } = useTranslation('dashboard');

  // Sparkline data sequences derived from real trend points
  const revTrendData =
    revenueVsExpenses.length > 1
      ? revenueVsExpenses.map((d) => d.revenue)
      : [kpis.totalRevenue * 0.4, kpis.totalRevenue * 0.6, kpis.totalRevenue * 0.75, kpis.totalRevenue];

  const expTrendData =
    revenueVsExpenses.length > 1
      ? revenueVsExpenses.map((d) => d.expenses)
      : [kpis.totalExpenses * 0.3, kpis.totalExpenses * 0.5, kpis.totalExpenses * 0.8, kpis.totalExpenses];

  const profitTrendData =
    revenueVsExpenses.length > 1
      ? revenueVsExpenses.map((d) => Math.max(0, d.revenue - d.expenses))
      : [kpis.netProfit * 0.3, kpis.netProfit * 0.5, kpis.netProfit * 0.8, kpis.netProfit];

  const grossProfit = period.grossProfit ?? kpis.netProfit;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
      {/* Card 1: Revenue for the selected period */}
      <MetricCard
        title={t('kpi.salesRevenue', { range: period.rangeLabel || t('kpi.period') })}
        value={formatMoney(period.revenue ?? kpis.totalRevenue)}
        change={kpis.revenueGrowth}
        changeType={growthType(kpis.revenueGrowth)}
        subValue={t('kpi.revenueSub', { amount: formatMoney(kpis.totalRevenue) })}
        badgeText={t('kpi.inflows')}
        badgeVariant="emerald"
        icon={
          <svg className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        sparklineData={revTrendData}
        sparklineColor="#10b981"
        sparklineId="rev-spark"
      />

      {/* Card 2: Operating Expenses */}
      <MetricCard
        title={t('kpi.cogs')}
        value={formatMoney(period.cogs ?? kpis.totalExpenses)}
        change={kpis.expenseGrowth}
        changeType={growthType(kpis.expenseGrowth, true)}
        subValue={t('kpi.cogsSub', { amount: formatMoney(kpis.totalCOGS ?? kpis.totalExpenses) })}
        badgeText={t('kpi.outflows')}
        badgeVariant="amber"
        icon={
          <svg className="w-4.5 h-4.5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 17h6l-6-6-6 6h6v-6h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        }
        sparklineData={expTrendData}
        sparklineColor="#f59e0b"
        sparklineId="exp-spark"
      />

      {/* Card 3: Net Profit */}
      <MetricCard
        title={t('kpi.grossProfit')}
        value={formatMoney(grossProfit)}
        change={kpis.profitGrowth}
        changeType={growthType(kpis.profitGrowth)}
        subValue={t('kpi.profitSub', { margin: period.profitMargin ?? 0, amount: formatMoney(kpis.netProfit) })}
        badgeText={grossProfit >= 0 ? t('kpi.profitable') : t('kpi.loss')}
        badgeVariant={grossProfit >= 0 ? 'emerald' : 'rose'}
        icon={
          <svg className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        }
        sparklineData={profitTrendData}
        sparklineColor="#10b981"
        sparklineId="profit-spark"
      />

      {/* Card 4: Active Lots / Low Stock */}
      <MetricCard
        title={t('kpi.activeBatches')}
        value={t('kpi.lots', { count: kpis.activeBatches || 0 })}
        subValue={t('kpi.unitsInInventory', { count: kpis.totalStockUnits || 0 })}
        badgeText={t('kpi.skus', { count: kpis.activeMedicines || 0 })}
        badgeVariant="indigo"
        icon={
          <svg className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        }
        sparklineData={[
          kpis.activeBatches * 0.7,
          kpis.activeBatches * 0.85,
          kpis.activeBatches * 0.9,
          kpis.activeBatches,
        ]}
        sparklineColor="#6366f1"
        sparklineId="stock-spark"
      />
    </div>
  );
};

export default KpiCards;
