import { Boxes, AlertTriangle, DollarSign, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import MetricCard from '../common/MetricCard';
import { formatMoney } from '../../utils/format';
import { getDaysUntilExpiry } from './stockUtils';

// KPI metric cards for the Stock page: from the server summary (whole inventory), falling back
// to the loaded batches only until the summary arrives.
const StockKpiCards = ({ batches, summary }) => {
  const { t } = useTranslation('stock');

  const totalActiveBatches = summary?.activeBatchesCount ?? batches.filter((b) => b.quantity > 0).length;
  const totalStockUnits = summary?.totalUnits ?? batches.reduce((acc, b) => acc + (b.quantity || 0), 0);
  const totalValuation = summary?.totalValuation ?? batches.reduce((acc, b) => acc + (b.quantity || 0) * (b.purchasePrice || 0), 0);
  // Expiring within 30 days or already past expiry. From the server summary (covers every batch,
  // not just the page on screen); the batch fallback is only used before the summary loads.
  const expiringSoonCount = summary
    ? (summary.expiringSoonCount || 0) + (summary.expiredCount || 0)
    : batches.filter((b) => {
        const days = getDaysUntilExpiry(b.expiryDate);
        return days !== null && days <= 30 && b.quantity > 0;
      }).length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
      <MetricCard
        title={t('kpi.activeLots')}
        value={totalActiveBatches.toString()}
        subValue={t('kpi.activeLotsSub')}
        badgeText={t('common:status.active')}
        badgeVariant="emerald"
        icon={<Boxes className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
        sparklineData={[12, 16, 14, 20, 22, 28, 25, totalActiveBatches]}
        sparklineColor="#10b981"
        sparklineId="active-stock-spark"
      />

      <MetricCard
        title={t('kpi.totalUnits')}
        value={totalStockUnits.toLocaleString()}
        subValue={t('kpi.totalUnitsSub')}
        badgeText={t('kpi.volume')}
        badgeVariant="emerald"
        icon={<Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
        sparklineData={[140, 180, 210, 290, 310, 390, 420, totalStockUnits]}
        sparklineColor="#10b981"
        sparklineId="stock-units-spark"
      />

      <MetricCard
        title={t('kpi.valuation')}
        value={formatMoney(Number(totalValuation) || 0)}
        subValue={t('kpi.valuationSub')}
        badgeText={t('kpi.capital')}
        badgeVariant="indigo"
        icon={<DollarSign className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
        sparklineData={[1200, 1450, 1300, 1900, 2100, 2400, 2800, totalValuation]}
        sparklineColor="#6366f1"
        sparklineId="stock-val-spark"
      />

      <MetricCard
        title={t('kpi.expiryRisk')}
        value={expiringSoonCount.toString()}
        subValue={expiringSoonCount > 0 ? t('kpi.expiryRiskSub') : t('kpi.expiryRiskNone')}
        badgeText={expiringSoonCount > 0 ? t('kpi.actionNeeded') : t('kpi.compliant')}
        badgeVariant={expiringSoonCount > 0 ? 'rose' : 'emerald'}
        icon={<AlertTriangle className={`w-4 h-4 ${expiringSoonCount > 0 ? 'text-rose-500' : 'text-emerald-500'}`} />}
        sparklineData={[4, 2, 6, 3, 5, 2, 1, expiringSoonCount]}
        sparklineColor={expiringSoonCount > 0 ? '#f43f5e' : '#10b981'}
        sparklineId="expiry-spark"
      />
    </div>
  );
};

export default StockKpiCards;
