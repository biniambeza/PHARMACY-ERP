import { ShoppingCart, Truck, DollarSign, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import MetricCard from '../common/MetricCard';
import { formatMoney } from '../../utils/format';

// KPI cards at the top of the Purchase Orders page.
const POMetrics = ({ totalOrders, pendingOrders, receivedOrders, totalProcurementSpend }) => {
  const { t } = useTranslation('procurement');
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
      <MetricCard
        title={t('metrics.totalRequisitions')}
        value={totalOrders.toString()}
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
        value={pendingOrders.toString()}
        subValue={t('metrics.pendingDeliveriesSub')}
        badgeText={pendingOrders > 0 ? t('metrics.inTransit') : t('metrics.clear')}
        badgeVariant="amber"
        icon={<Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
        sparklineData={[4, 6, 5, 8, 7, 9, 6, pendingOrders]}
        sparklineColor="#f59e0b"
        sparklineId="pending-po-spark"
      />

      <MetricCard
        title={t('metrics.receivedDeliveries')}
        value={receivedOrders.toString()}
        subValue={t('metrics.receivedDeliveriesSub')}
        badgeText={t('metrics.fulfilled')}
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
        badgeText={t('metrics.capital')}
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
