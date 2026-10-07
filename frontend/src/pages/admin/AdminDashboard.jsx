import { useState, useEffect } from 'react';
import {
  getPharmacies,
  getSystemStats,
  togglePharmacyStatus,
  deletePharmacy,
} from '../../api/adminApi';
import MetricCard from '../../components/common/MetricCard';
import StatusBadge from '../../components/common/StatusBadge';
import DataTable from '../../components/common/DataTable';
import { MetricCardSkeleton, CardSkeleton } from '../../components/common/SkeletonLoader';
import CreatePharmacyModal from './CreatePharmacyModal';

const AdminDashboard = () => {
  const [pharmacies, setPharmacies] = useState([]);
  const [stats, setStats] = useState({
    totalPharmacies: 0,
    activePharmacies: 0,
    suspendedPharmacies: 0,
    totalPharmacists: 0,
    totalGrossVolume: 0,
    totalTransactions: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedPharmacy, setSelectedPharmacy] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [pharmacyData, statsData] = await Promise.all([
        getPharmacies(),
        getSystemStats(),
      ]);
      setPharmacies(pharmacyData.pharmacies || []);
      setStats(statsData.stats || {});
    } catch (err) {
      console.error('Failed to load admin platform metrics:', err);
      setError('Unable to load platform data. Please check connection and authentication.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleOpenCreate = () => setIsModalOpen(true);
    const handleRefresh = () => loadData();

    window.addEventListener('open-create-pharmacy', handleOpenCreate);
    window.addEventListener('refresh-admin-data', handleRefresh);

    return () => {
      window.removeEventListener('open-create-pharmacy', handleOpenCreate);
      window.removeEventListener('refresh-admin-data', handleRefresh);
    };
  }, []);

  const handleToggleStatus = async (id) => {
    setActionLoading(id);
    try {
      await togglePharmacyStatus(id);
      await loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update pharmacy status');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id, name) => {
    if (
      !window.confirm(
        `Are you sure you want to permanently delete "${name}" and its associated pharmacist user account? This action cannot be undone.`
      )
    ) {
      return;
    }
    setActionLoading(id);
    try {
      await deletePharmacy(id);
      await loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete pharmacy');
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
          Platform Data Error
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          {error}
        </p>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
        >
          Retry Loading
        </button>
      </div>
    );
  }

  // Table Columns configuration for DataTable
  const tableColumns = [
    {
      header: 'Pharmacy & License',
      key: 'name',
      render: (item) => (
        <div>
          <button
            onClick={() => handleViewDetails(item)}
            className="font-bold text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 text-left transition cursor-pointer block"
          >
            {item.name}
          </button>
          <span className="inline-block mt-0.5 text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            Lic: {item.licenseNo}
          </span>
        </div>
      ),
    },
    {
      header: 'Assigned Owner / Email',
      key: 'owner',
      render: (item) => (
        <div>
          <span className="font-semibold text-slate-800 dark:text-slate-200 block">
            {item.owner?.name || 'Unassigned'}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono block">
            {item.owner?.email || 'N/A'}
          </span>
        </div>
      ),
    },
    {
      header: 'Active Batches',
      key: 'activeBatches',
      render: (item) => (
        <div>
          <span className="font-extrabold text-slate-900 dark:text-white block">
            {item.activeBatches || 0} Lots
          </span>
          <span className="text-[10px] text-slate-400 block">
            {item.totalSales || 0} sales recorded
          </span>
        </div>
      ),
    },
    {
      header: 'Created Date',
      key: 'createdAt',
      render: (item) => (
        <span className="text-slate-600 dark:text-slate-400 text-[11px] font-mono">
          {item.createdAt
            ? new Date(item.createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : 'N/A'}
        </span>
      ),
    },
    {
      header: 'Status',
      key: 'status',
      render: (item) => (
        <StatusBadge
          status={item.status}
          label={item.status === 'active' ? 'Active' : 'Suspended'}
          size="sm"
        />
      ),
    },
    {
      header: 'Actions',
      key: 'actions',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => handleViewDetails(item)}
            className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition cursor-pointer"
          >
            Details
          </button>
          <button
            onClick={() => handleToggleStatus(item._id)}
            disabled={actionLoading === item._id}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer border ${
              item.status === 'active'
                ? 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 border-amber-200 dark:border-amber-800/60'
                : 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 border-emerald-200 dark:border-emerald-800/60'
            }`}
          >
            {actionLoading === item._id
              ? '...'
              : item.status === 'active'
              ? 'Suspend'
              : 'Activate'}
          </button>
          <button
            onClick={() => handleDelete(item._id, item.name)}
            disabled={actionLoading === item._id}
            className="px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 border border-rose-200 dark:border-rose-800/60 rounded-lg transition cursor-pointer"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in">
      {/* ------------------------------------------------------------- */}
      {/* 1. TOP EXECUTIVE KPI CARDS ROW                                */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Card 1: Total Licensed Pharmacies */}
        <MetricCard
          title="Total Licensed Pharmacies"
          value={`${stats.totalPharmacies || 0} Branches`}
          change={`${stats.activePharmacies || 0} Active`}
          changeType="positive"
          subValue="in SaaS network"
          badgeText="Licensed"
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
          title="Active Pharmacist Users"
          value={`${stats.totalPharmacists || 0} Staff`}
          change="Authenticated"
          changeType="positive"
          subValue="authorized operators"
          badgeText="Verified"
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
          title="Platform Gross Volume"
          value={`$${Number(stats.totalGrossVolume || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          change={`${stats.totalTransactions || 0} Txns`}
          changeType="positive"
          subValue="multi-tenant throughput"
          badgeText="Throughput"
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
          title="Suspended Tenancies"
          value={`${stats.suspendedPharmacies || 0} Accounts`}
          change={stats.suspendedPharmacies > 0 ? 'Review Reqd' : '0 Flags'}
          changeType={stats.suspendedPharmacies > 0 ? 'negative' : 'positive'}
          subValue="compliance review queue"
          badgeText={stats.suspendedPharmacies > 0 ? 'Flagged' : 'Healthy'}
          badgeVariant={stats.suspendedPharmacies > 0 ? 'rose' : 'emerald'}
          icon={
            <svg className="w-4.5 h-4.5 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          }
          sparklineData={
            stats.suspendedPharmacies > 0 ? [1, 2, stats.suspendedPharmacies] : [1, 0.5, 0]
          }
          sparklineColor={stats.suspendedPharmacies > 0 ? '#ef4444' : '#10b981'}
          sparklineId="susp-spark"
        />
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. MAIN MULTI-TENANT MANAGEMENT TABLE (Consuming DataTable)    */}
      {/* ------------------------------------------------------------- */}
      <DataTable
        title="Registered Pharmacy Tenants"
        subtitle="Manage licensed organizations, operational status, and primary pharmacist credentials"
        data={pharmacies}
        columns={tableColumns}
        searchPlaceholder="Search pharmacy name, license ID, owner, email..."
        searchKeys={['name', 'licenseNo', 'address', 'phone', 'owner.name', 'owner.email']}
        filterOptions={[
          { label: `All (${pharmacies.length})`, value: 'all' },
          {
            label: `Active (${pharmacies.filter((p) => p.status === 'active').length})`,
            value: 'active',
          },
          {
            label: `Suspended (${pharmacies.filter((p) => p.status === 'suspended').length})`,
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
            <span>Provision Pharmacy</span>
          </button>
        }
        emptyMessage="No pharmacies found"
        emptySubtext="Provision a new branch or adjust your search filter to display tenant organizations."
      />

      {/* ------------------------------------------------------------- */}
      {/* 3. TENANT DETAILS MODAL                                        */}
      {/* ------------------------------------------------------------- */}
      {selectedPharmacy && isDetailsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-[#161c26] rounded-2xl border border-slate-100/90 dark:border-slate-800/80 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {selectedPharmacy.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    Lic: {selectedPharmacy.licenseNo}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDetailsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">
                  Status
                </span>
                <StatusBadge status={selectedPharmacy.status} size="sm" />
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">
                  Active Batches
                </span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedPharmacy.activeBatches || 0} Lots
                </span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">
                  Phone
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {selectedPharmacy.phone}
                </span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">
                  Total Sales
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {selectedPharmacy.totalSales || 0} orders
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/60 text-xs">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">
                Physical Address
              </span>
              <p className="text-slate-700 dark:text-slate-300 mt-0.5">
                {selectedPharmacy.address}
              </p>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/60 text-xs">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">
                Primary Operator Account
              </span>
              <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                {selectedPharmacy.owner?.name} ({selectedPharmacy.owner?.email})
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsDetailsOpen(false)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
