import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getPharmacies,
  getSystemStats,
  togglePharmacyStatus,
  deletePharmacy,
} from '../../api/adminApi';
import useAsync from '../../hooks/useAsync';
import DataTable from '../../components/common/DataTable';
import { MetricCardSkeleton, CardSkeleton } from '../../components/common/SkeletonLoader';
import AdminKpiCards from '../../components/admin/AdminKpiCards';
import PharmacyDetailsModal from '../../components/admin/PharmacyDetailsModal';
import { buildPharmacyColumns } from '../../components/admin/pharmacyColumns';
import CreatePharmacyModal from './CreatePharmacyModal';
import SubscriptionModal from './SubscriptionModal';
import SupportView from './SupportView';
import ResetPasswordModal from './ResetPasswordModal';
import PlatformMetrics from './PlatformMetrics';
import AnnouncementsManager from './AnnouncementsManager';
import { logApiError } from '../../api/logApiError';

const TABS = ['pharmacies', 'metrics', 'announcements'];

const INITIAL_DATA = {
  pharmacies: [],
  stats: {
    totalPharmacies: 0,
    activePharmacies: 0,
    suspendedPharmacies: 0,
    totalPharmacists: 0,
    totalGrossVolume: 0,
    totalTransactions: 0,
  },
};

const AdminDashboard = () => {
  const { t } = useTranslation('admin');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedPharmacy, setSelectedPharmacy] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [tab, setTab] = useState('pharmacies');
  const [billingPharmacy, setBillingPharmacy] = useState(null);
  const [supportPharmacy, setSupportPharmacy] = useState(null);
  const [resetUser, setResetUser] = useState(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const [pharmacyData, statsData] = await Promise.all([
        getPharmacies(),
        getSystemStats(),
      ]);
      return { pharmacies: pharmacyData.pharmacies || [], stats: statsData.stats || {} };
    } catch (err) {
      logApiError('Failed to load admin platform metrics', err);
      throw err;
    }
  }, []);
  const { data, error: loadError, loading, reload: loadData } = useAsync(fetchDashboard, INITIAL_DATA);
  const { pharmacies, stats } = data;
  const error = loadError ? 'dashboard.loadError' : ''; // i18n key, translated when rendered

  useEffect(() => {
    const handleOpenCreate = () => setIsModalOpen(true);
    const handleRefresh = () => loadData();

    window.addEventListener('open-create-pharmacy', handleOpenCreate);
    window.addEventListener('refresh-admin-data', handleRefresh);

    return () => {
      window.removeEventListener('open-create-pharmacy', handleOpenCreate);
      window.removeEventListener('refresh-admin-data', handleRefresh);
    };
  }, [loadData]);

  const handleToggleStatus = async (id) => {
    setActionLoading(id);
    try {
      await togglePharmacyStatus(id);
      await loadData();
    } catch (err) {
      alert(err.response?.data?.message || t('dashboard.toggleStatusFailed'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleArchive = async (id, name) => {
    if (!window.confirm(t('dashboard.archiveConfirm', { name }))) {
      return;
    }
    setActionLoading(id);
    try {
      await deletePharmacy(id);
      await loadData();
    } catch (err) {
      alert(err.response?.data?.message || t('dashboard.archiveFailed'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewDetails = (pharmacy) => {
    setSelectedPharmacy(pharmacy);
    setIsDetailsOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-6 sm:space-y-8 animate-fade-in">
        {/* KPI Skeletons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
        </div>
        {/* Table Skeleton */}
        <CardSkeleton height="h-96" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 bg-white dark:bg-[#161c26] rounded-2xl border border-rose-200 dark:border-rose-900/50 text-center space-y-3 shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
          {t('dashboard.dataErrorTitle')}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          {t(error)}
        </p>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
        >
          {t('dashboard.retry')}
        </button>
      </div>
    );
  }

  const tableColumns = buildPharmacyColumns({
    t,
    actionLoading,
    onViewDetails: handleViewDetails,
    onBilling: setBillingPharmacy,
    onSupport: setSupportPharmacy,
    onToggleStatus: handleToggleStatus,
    onArchive: handleArchive,
  });

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in">
      {/* 1. TOP EXECUTIVE KPI CARDS ROW */}
      <AdminKpiCards stats={stats} />

      {/* Section tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
              tab === id
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white dark:bg-[#161c26] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {t(`dashboard.tabs.${id}`)}
          </button>
        ))}
      </div>

      {tab === 'metrics' && <PlatformMetrics />}
      {tab === 'announcements' && <AnnouncementsManager pharmacies={pharmacies} />}

      {/* 2. MAIN MULTI-TENANT MANAGEMENT TABLE (Consuming DataTable) */}
      {tab === 'pharmacies' && (
      <DataTable
        title={t('dashboard.table.title')}
        subtitle={t('dashboard.table.subtitle')}
        data={pharmacies}
        columns={tableColumns}
        searchPlaceholder={t('dashboard.table.searchPlaceholder')}
        searchKeys={['name', 'licenseNo', 'address', 'phone', 'owner.name', 'owner.email']}
        filterOptions={[
          { label: t('dashboard.table.filterAll', { count: pharmacies.length }), value: 'all' },
          {
            label: t('dashboard.table.filterActive', {
              count: pharmacies.filter((p) => p.status === 'active').length,
            }),
            value: 'active',
          },
          {
            label: t('dashboard.table.filterSuspended', {
              count: pharmacies.filter((p) => p.status === 'suspended').length,
            }),
            value: 'suspended',
          },
        ]}
        activeFilter={statusFilter}
        onFilterChange={setStatusFilter}
        filterKey="status"
        pageSize={6}
        headerAction={
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer shrink-0"
          >
            <span className="text-base leading-none font-bold">+</span>
            <span>{t('dashboard.table.provision')}</span>
          </button>
        }
        emptyMessage={t('dashboard.table.emptyMessage')}
        emptySubtext={t('dashboard.table.emptySubtext')}
      />
      )}

      {/* 3. TENANT DETAILS MODAL */}
      {selectedPharmacy && isDetailsOpen && (
        <PharmacyDetailsModal
          pharmacy={selectedPharmacy}
          onClose={() => setIsDetailsOpen(false)}
          onResetPassword={setResetUser}
          onOpenSupport={() => {
            setIsDetailsOpen(false);
            setSupportPharmacy(selectedPharmacy);
          }}
        />
      )}

      {billingPharmacy && (
        <SubscriptionModal
          key={billingPharmacy._id}
          pharmacy={billingPharmacy}
          onClose={() => setBillingPharmacy(null)}
          onSaved={loadData}
        />
      )}
      {supportPharmacy && (
        <SupportView key={supportPharmacy._id} pharmacy={supportPharmacy} onClose={() => setSupportPharmacy(null)} />
      )}

      {resetUser && <ResetPasswordModal key={resetUser._id} user={resetUser} onClose={() => setResetUser(null)} />}

      {/* Provision Pharmacy Modal */}
      <CreatePharmacyModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={loadData}
      />
    </div>
  );
};

export default AdminDashboard;
