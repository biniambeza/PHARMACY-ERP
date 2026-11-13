import { ShoppingCart, Truck, DollarSign, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import MetricCard from '../common/MetricCard';
import { formatMoney, formatNumber } from '../../utils/format';

// KPI cards at the top of the Purchase Orders page. `totalOrders` is the server-side count of
// all matching orders; the other figures come from the loaded page, so when the list spans
// several pages (`paged`) they're labelled "on this page".
const POMetrics = ({ totalOrders, pendingOrders, receivedOrders, totalProcurementSpend, paged = false }) => {
  const { t } = useTranslation('procurement');
  const pageBadge = (badge) => (paged ? t('metrics.onThisPage') : badge);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
      <MetricCard
        title={t('metrics.totalRequisitions')}
        value={formatNumber(totalOrders)}
        subValue={t('metrics.totalRequisitionsSub')}
        badgeText={t('metrics.totalPOs')}
        badgeVariant="emerald"
        icon={<ShoppingCart className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
        sparklineData={[10, 14, 12, 18, 16, 22, 25, totalOrders]}
        sparklineColor="#10b981"
        sparklineId="total-po-spark"
      />

      <MetricCard
        title={t('metrics.pendingDeliveries')}
        value={formatNumber(pendingOrders)}
        subValue={t('metrics.pendingDeliveriesSub')}
        badgeText={pageBadge(pendingOrders > 0 ? t('metrics.inTransit') : t('metrics.clear'))}
        badgeVariant="amber"
        icon={<Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
        sparklineData={[4, 6, 5, 8, 7, 9, 6, pendingOrders]}
        sparklineColor="#f59e0b"
        sparklineId="pending-po-spark"
      />

      <MetricCard
        title={t('metrics.receivedDeliveries')}
        value={formatNumber(receivedOrders)}
        subValue={t('metrics.receivedDeliveriesSub')}
        badgeText={pageBadge(t('metrics.fulfilled'))}
        badgeVariant="emerald"
        icon={<Truck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
        sparklineData={[6, 9, 8, 12, 14, 16, 18, receivedOrders]}
        sparklineColor="#10b981"
        sparklineId="received-po-spark"
      />

      <MetricCard
        title={t('metrics.procurementSpend')}
        value={formatMoney(totalProcurementSpend)}
        subValue={t('metrics.procurementSpendSub')}
        badgeText={pageBadge(t('metrics.capital'))}
        badgeVariant="indigo"
        icon={<DollarSign className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
        sparklineData={[800, 1200, 1100, 1600, 1900, 2400, totalProcurementSpend]}
        sparklineColor="#6366f1"
        sparklineId="spend-po-spark"
      />
    </div>
  );
};

export default POMetrics;
