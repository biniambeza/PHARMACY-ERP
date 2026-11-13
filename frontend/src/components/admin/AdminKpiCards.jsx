import { useTranslation } from 'react-i18next';
import { formatMoney } from '../../utils/format';
import MetricCard from '../common/MetricCard';

// Top KPI row of the admin dashboard (platform totals).
const AdminKpiCards = ({ stats }) => {
  const { t } = useTranslation('admin');
  const suspended = stats.suspendedPharmacies > 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
      {/* Card 1: Total Licensed Pharmacies */}
      <MetricCard
        title={t('dashboard.kpi.totalPharmacies')}
        value={t('dashboard.kpi.branches', { count: stats.totalPharmacies || 0 })}
        change={t('dashboard.kpi.activeCount', { count: stats.activePharmacies || 0 })}
        changeType="positive"
        subValue={t('dashboard.kpi.inNetwork')}
        badgeText={t('dashboard.kpi.licensed')}
        badgeVariant="emerald"
        icon={
          <svg className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        }
        sparklineData={[
          (stats.totalPharmacies || 1) * 0.4,
          (stats.totalPharmacies || 1) * 0.65,
          (stats.totalPharmacies || 1) * 0.85,
          stats.totalPharmacies || 1,
        ]}
        sparklineColor="#10b981"
        sparklineId="pharm-spark"
      />

      {/* Card 2: Active Pharmacist Operators */}
      <MetricCard
        title={t('dashboard.kpi.activeUsers')}
        value={t('dashboard.kpi.staffCount', { count: stats.totalPharmacists || 0 })}
        change={t('dashboard.kpi.authenticated')}
        changeType="positive"
        subValue={t('dashboard.kpi.authorizedOperators')}
        badgeText={t('dashboard.kpi.verified')}
        badgeVariant="indigo"
        icon={
          <svg className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4a4 4 0 100 8 4 4 0 000-8zM6 20a6 6 0 0112 0H6z" />
          </svg>
        }
        sparklineData={[
          (stats.totalPharmacists || 1) * 0.5,
          (stats.totalPharmacists || 1) * 0.7,
          (stats.totalPharmacists || 1) * 0.85,
          stats.totalPharmacists || 1,
        ]}
        sparklineColor="#6366f1"
        sparklineId="users-spark"
      />

      {/* Card 3: Platform Gross Throughput */}
      <MetricCard
        title={t('dashboard.kpi.grossVolume')}
        value={formatMoney(Number(stats.totalGrossVolume) || 0)}
        change={t('dashboard.kpi.txns', { count: stats.totalTransactions || 0 })}
        changeType="positive"
        subValue={t('dashboard.kpi.throughputSub')}
        badgeText={t('dashboard.kpi.throughput')}
        badgeVariant="emerald"
        icon={
          <svg className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
          </svg>
        }
        sparklineData={[
          (stats.totalGrossVolume || 100) * 0.25,
          (stats.totalGrossVolume || 100) * 0.55,
          (stats.totalGrossVolume || 100) * 0.8,
          stats.totalGrossVolume || 100,
        ]}
        sparklineColor="#10b981"
        sparklineId="vol-spark"
      />

      {/* Card 4: Suspended / Compliance Review */}
      <MetricCard
        title={t('dashboard.kpi.suspendedTenancies')}
        value={t('dashboard.kpi.accounts', { count: stats.suspendedPharmacies || 0 })}
        change={suspended ? t('dashboard.kpi.reviewRequired') : t('dashboard.kpi.zeroFlags')}
        changeType={suspended ? 'negative' : 'positive'}
        subValue={t('dashboard.kpi.complianceQueue')}
        badgeText={suspended ? t('dashboard.kpi.flagged') : t('dashboard.kpi.healthy')}
        badgeVariant={suspended ? 'rose' : 'emerald'}
        icon={
          <svg className="w-4.5 h-4.5 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        }
        sparklineData={suspended ? [1, 2, stats.suspendedPharmacies] : [1, 0.5, 0]}
        sparklineColor={suspended ? '#ef4444' : '#10b981'}
        sparklineId="susp-spark"
      />
    </div>
  );
};

export default AdminKpiCards;
