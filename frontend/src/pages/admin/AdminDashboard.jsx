import { useState, useEffect, useMemo } from 'react';
import { getPharmacies, getSystemStats, togglePharmacyStatus, deletePharmacy } from '../../api/adminApi';
import CreatePharmacyModal from './CreatePharmacyModal';

const AdminDashboard = () => {
  const [pharmacies, setPharmacies] = useState([]);
  const [stats, setStats] = useState({
    totalPharmacies: 0,
    activePharmacies: 0,
    suspendedPharmacies: 0,
    totalPharmacists: 0,
  });
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadData = async () => {
    try {
      setLoading(true);
      const [pharmacyData, statsData] = await Promise.all([
        getPharmacies(),
        getSystemStats(),
      ]);
      setPharmacies(pharmacyData.pharmacies || []);
      setStats(statsData.stats || {});
    } catch (error) {
      console.error('Failed to load admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Listen for events dispatched from AdminLayout sidebar
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
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to update status');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete "${name}" and its pharmacist account?`)) {
      return;
    }
    setActionLoading(id);
    try {
      await deletePharmacy(id);
      await loadData();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to delete pharmacy');
    } finally {
      setActionLoading(null);
    }
  };

  // Filtered pharmacies list
  const filteredPharmacies = useMemo(() => {
    return pharmacies.filter((p) => {
      const matchesSearch =
        (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.licenseNo || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.address || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.phone || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.owner?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.owner?.email || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'all' ? true : p.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [pharmacies, searchQuery, statusFilter]);

  const activeCount = pharmacies.filter((p) => p.status === 'active').length;
  const suspendedCount = pharmacies.filter((p) => p.status === 'suspended').length;
  const activeRate = pharmacies.length > 0 ? ((activeCount / pharmacies.length) * 100).toFixed(1) : 100;

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in">
      {/* ------------------------------------------------------------- */}
      {/* 1. TOP SUB-HEADER BAR                                         */}
      {/* ------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 mb-1.5">
            <span>🛡️</span> System Control Hub
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Pharmacy Tenants & Branch Licensing
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Oversee tenant provisioning, operational access, and primary pharmacist credentials.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            title="Refresh Data"
            className="p-2.5 bg-white dark:bg-[#111827] text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 border border-slate-200/90 dark:border-slate-800 rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs shadow-blue-500/20 transition cursor-pointer"
          >
            <span className="text-base leading-none font-bold">+</span>
            <span>Create Pharmacy</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. OVERVIEW METRIC CARDS (Matching Pharmacist Dashboard UI)   */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Card 1: Total Pharmacies */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Pharmacies
            </span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50">
              Network
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {stats.totalPharmacies || 0}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="w-5 h-5 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-bold">
              🏥
            </span>
            <span className="truncate">Registered tenant branches</span>
          </div>
        </div>

        {/* Card 2: Active Operations */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Active Branches
            </span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
              {activeRate}%
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight">
              {stats.activePharmacies || 0}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="w-5 h-5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[10px] font-bold">
              ⚡
            </span>
            <span className="truncate">Full dispensing & POS access</span>
          </div>
        </div>

        {/* Card 3: Suspended */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Suspended Tenants
            </span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50">
              {stats.suspendedPharmacies > 0 ? 'Action Reqd' : 'Clean'}
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-rose-600 dark:text-rose-400 tracking-tight">
              {stats.suspendedPharmacies || 0}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="w-5 h-5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center text-[10px] font-bold">
              🔒
            </span>
            <span className="truncate">Access blocked at gateway</span>
          </div>
        </div>

        {/* Card 4: Pharmacist Accounts */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Pharmacist Staff
            </span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50">
              Verified
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 tracking-tight">
              {stats.totalPharmacists || 0}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="w-5 h-5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[10px] font-bold">
              👤
            </span>
            <span className="truncate">Authorized credential holders</span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. PLATFORM HEALTH & DISTRIBUTION OVERVIEW ROW                */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Operational Allocation Card */}
        <div className="lg:col-span-7 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800/80">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Tenant Allocation & Operational Status
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Health distribution across registered pharmaceutical organizations
              </p>
            </div>
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 rounded-lg">
              {activeRate}% Healthy
            </span>
          </div>

          {/* Visual Progress Bar */}
          <div className="space-y-3">
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-3 rounded-full overflow-hidden flex">
              <div
                style={{ width: `${activeRate}%` }}
                className="bg-emerald-500 transition-all duration-500"
                title={`Active: ${activeRate}%`}
              />
              <div
                style={{ width: `${(100 - activeRate)}%` }}
                className="bg-rose-500 transition-all duration-500"
                title={`Suspended: ${(100 - activeRate).toFixed(1)}%`}
              />
            </div>

            <div className="grid grid-cols-3 gap-4 pt-2 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Active Ratio</span>
                <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                  {activeCount} / {pharmacies.length}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Online & Serving</span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Suspended Ratio</span>
                <span className="text-base font-extrabold text-rose-600 dark:text-rose-400">
                  {suspendedCount} / {pharmacies.length}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Locked Accounts</span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Average Staff</span>
                <span className="text-base font-extrabold text-blue-600 dark:text-blue-400">
                  {pharmacies.length > 0 ? (stats.totalPharmacists / pharmacies.length).toFixed(1) : 1}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Pharmacists / branch</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Security & Architecture Guardrails Card */}
        <div className="lg:col-span-5 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800/80">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                SaaS Isolation Guardrails
              </h3>
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                ● Enforced
              </span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-start gap-2.5">
                <span className="text-emerald-500 font-bold">✓</span>
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">
                    `pharmacyScope` Tenant Isolation
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    All DB queries are partitioned by indexed pharmacy foreign key.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="text-emerald-500 font-bold">✓</span>
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">
                    FEFO Expiry Rules
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    First-Expired First-Out inventory auto-deduction active across all stores.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="text-emerald-500 font-bold">✓</span>
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">
                    JWT Session & Role Boundaries
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Pharmacists cannot access cross-tenant records or admin hub.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
            <span>Platform Engine: v2.4 Multi-Tenant</span>
            <span className="text-blue-600 dark:text-blue-400 font-semibold cursor-pointer" onClick={() => setIsModalOpen(true)}>
              + Provision New Branch
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4. REGISTERED PHARMACIES TABLE (Matching Suppliers/Sales UI)  */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs">
        {/* Table Header with Search and Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-100 dark:border-slate-800/80">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Registered Pharmacies Directory
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manage individual branch licenses, operational privileges, and contact points
            </p>
          </div>

          {/* Search & Filter Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative min-w-[220px]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search branch, license, email..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
              />
              <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Status Filter Tabs */}
            <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-medium">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-white dark:bg-[#111827] text-blue-600 dark:text-blue-400 font-bold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                All ({pharmacies.length})
              </button>
              <button
                onClick={() => setStatusFilter('active')}
                className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                  statusFilter === 'active'
                    ? 'bg-white dark:bg-[#111827] text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Active ({activeCount})
              </button>
              <button
                onClick={() => setStatusFilter('suspended')}
                className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                  statusFilter === 'suspended'
                    ? 'bg-white dark:bg-[#111827] text-rose-600 dark:text-rose-400 font-bold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Suspended ({suspendedCount})
              </button>
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-400">Loading pharmacies...</p>
            </div>
          ) : filteredPharmacies.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto text-xl mb-3">
                🏥
              </div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {searchQuery ? 'No pharmacies match your search' : 'No pharmacies registered yet'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4 max-w-sm mx-auto">
                {searchQuery
                  ? 'Try adjusting your search criteria or filter to locate the pharmacy.'
                  : 'Start by provisioning your first pharmacy organization and assigning its credentials.'}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer"
                >
                  + Create First Pharmacy
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800 text-slate-400">
                  <th className="pb-3 font-semibold">Pharmacy & License</th>
                  <th className="pb-3 font-semibold">Location & Contact</th>
                  <th className="pb-3 font-semibold">Pharmacist Account</th>
                  <th className="pb-3 font-semibold">Tenant Status</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filteredPharmacies.map((item) => (
                  <tr key={item._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                    {/* Pharmacy & License */}
                    <td className="py-3.5">
                      <span className="font-bold text-slate-900 dark:text-white block text-sm">
                        {item.name}
                      </span>
                      <span className="inline-block mt-0.5 text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        Lic: {item.licenseNo}
                      </span>
                    </td>

                    {/* Location & Contact */}
                    <td className="py-3.5">
                      <span className="text-slate-700 dark:text-slate-300 block">
                        {item.address}
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        📞 {item.phone}
                      </span>
                    </td>

                    {/* Pharmacist Account */}
                    <td className="py-3.5">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                        {item.owner?.name || 'Unassigned'}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono block">
                        {item.owner?.email || 'N/A'}
                      </span>
                    </td>

                    {/* Status Pill */}
                    <td className="py-3.5">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                          item.status === 'active'
                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50'
                            : 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            item.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                          }`}
                        />
                        {item.status === 'active' ? 'Active' : 'Suspended'}
                      </span>
                    </td>

                    {/* Action Buttons */}
                    <td className="py-3.5 text-right space-x-2">
                      <button
                        onClick={() => handleToggleStatus(item._id)}
                        disabled={actionLoading === item._id}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer border ${
                          item.status === 'active'
                            ? 'text-amber-600 dark:text-amber-400 bg-amber-50/80 dark:bg-amber-950/30 hover:bg-amber-100 border-amber-200 dark:border-amber-800/50'
                            : 'text-emerald-600 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/30 hover:bg-emerald-100 border-emerald-200 dark:border-emerald-800/50'
                        }`}
                      >
                        {actionLoading === item._id
                          ? 'Updating...'
                          : item.status === 'active'
                          ? 'Suspend'
                          : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDelete(item._id, item.name)}
                        disabled={actionLoading === item._id}
                        className="px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50/80 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-800/50 rounded-xl transition cursor-pointer"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create Pharmacy Modal */}
      <CreatePharmacyModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={loadData}
      />
    </div>
  );
};

export default AdminDashboard;
