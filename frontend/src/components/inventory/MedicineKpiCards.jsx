import { Pill, ShieldAlert, ShieldCheck, DollarSign } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import MetricCard from '../common/MetricCard';
import { formatMoney } from '../../utils/format';

// KPI summary row for the medicine catalog page.
const MedicineKpiCards = ({ medicines, categoryCount }) => {
  const { t } = useTranslation('medicines');

  const totalProducts = medicines.length;
  const rxCount = medicines.filter((m) => m.requiresPrescription).length;
  const otcCount = totalProducts - rxCount;
  const avgPrice = totalProducts > 0
    ? medicines.reduce((sum, m) => sum + (Number(m.price) || 0), 0) / totalProducts
    : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
      <MetricCard
        title={t('kpi.totalTitle')}
        value={totalProducts.toString()}
        subValue={t('kpi.totalSub')}
        badgeText={t('kpi.totalBadge')}
        badgeVariant="emerald"
        icon={<Pill className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
        sparklineData={[15, 18, 22, 25, 29, 32, 38, totalProducts]}
        sparklineColor="#10b981"
        sparklineId="total-med-spark"
      />

      <MetricCard
        title={t('kpi.rxTitle')}
        value={rxCount.toString()}
        subValue={t('kpi.rxSub', { percent: totalProducts > 0 ? Math.round((rxCount / totalProducts) * 100) : 0 })}
        badgeText={t('kpi.rxBadge')}
        badgeVariant="amber"
        icon={<ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
        sparklineData={[8, 12, 10, 15, 14, 18, 17, rxCount]}
        sparklineColor="#f59e0b"
        sparklineId="rx-med-spark"
      />

      <MetricCard
        title={t('kpi.otcTitle')}
        value={otcCount.toString()}
        subValue={t('kpi.otcSub')}
        badgeText={t('kpi.otcBadge')}
        badgeVariant="emerald"
        icon={<ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
        sparklineData={[10, 14, 16, 18, 22, 21, 24, otcCount]}
        sparklineColor="#10b981"
        sparklineId="otc-med-spark"
      />

      <MetricCard
        title={t('kpi.avgTitle')}
        value={formatMoney(avgPrice)}
        subValue={t('kpi.avgSub', { count: categoryCount })}
        badgeText={t('kpi.avgBadge')}
        badgeVariant="indigo"
        icon={<DollarSign className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
        sparklineData={[20, 24, 21, 27, 26, 31, 29, avgPrice]}
        sparklineColor="#6366f1"
        sparklineId="price-med-spark"
      />
    </div>
  );
};

export default MedicineKpiCards;
