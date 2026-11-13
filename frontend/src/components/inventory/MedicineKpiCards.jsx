import { Pill, ShieldAlert, ShieldCheck, DollarSign } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import MetricCard from '../common/MetricCard';
import { formatMoney, formatNumber } from '../../utils/format';

// KPI summary row for the medicine catalog page. `total` is the server-side count of all
// matching medicines; the other figures come from the loaded page, so when the list spans
// several pages (`paged`) they're labelled "on this page".
const MedicineKpiCards = ({ medicines, categoryCount, total, paged = false }) => {
  const { t } = useTranslation('medicines');

  const pageCount = medicines.length;
  const totalProducts = typeof total === 'number' ? total : pageCount;
  const rxCount = medicines.filter((m) => m.requiresPrescription).length;
  const otcCount = pageCount - rxCount;
  const avgPrice = pageCount > 0
    ? medicines.reduce((sum, m) => sum + (Number(m.price) || 0), 0) / pageCount
    : 0;
  const rxPercent = pageCount > 0 ? Math.round((rxCount / pageCount) * 100) : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
      <MetricCard
        title={t('kpi.totalTitle')}
        value={formatNumber(totalProducts)}
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
        value={formatNumber(rxCount)}
        subValue={paged ? t('kpi.rxSubPage', { percent: rxPercent }) : t('kpi.rxSub', { percent: rxPercent })}
        badgeText={paged ? t('kpi.onThisPage') : t('kpi.rxBadge')}
        badgeVariant="amber"
        icon={<ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
        sparklineData={[8, 12, 10, 15, 14, 18, 17, rxCount]}
        sparklineColor="#f59e0b"
        sparklineId="rx-med-spark"
      />

      <MetricCard
        title={t('kpi.otcTitle')}
        value={formatNumber(otcCount)}
        subValue={t('kpi.otcSub')}
        badgeText={paged ? t('kpi.onThisPage') : t('kpi.otcBadge')}
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
        badgeText={paged ? t('kpi.onThisPage') : t('kpi.avgBadge')}
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
