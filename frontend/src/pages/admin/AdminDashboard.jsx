import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getPharmacies, getSystemStats, togglePharmacyStatus, deletePharmacy } from '../../api/adminApi';
import CreatePharmacyModal from './CreatePharmacyModal';

const AdminDashboard = () => {
  const { user, logout } = useAuth();
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

  const loadData = async () => {
    try {
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

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 selection:bg-purple-500 selection:text-white">
      <div className="max-w-6xl mx-auto">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-800 gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20 mb-1.5">
              Admin Control Center
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">System Admin Dashboard</h1>
            <p className="text-xs text-slate-400">Oversee all pharmacy branches, licenses, and pharmacist accounts</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <span className="block text-xs font-semibold text-slate-200">{user?.name}</span>
              <span className="block text-[11px] text-slate-500">{user?.email}</span>
            </div>
            <button
              onClick={logout}
              className="px-3.5 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Overview Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-800 border border-slate-700/80 rounded-xl p-4">
            <span className="text-xs font-medium text-slate-400">Total Pharmacies</span>
            <p className="text-2xl font-extrabold text-white mt-1">{stats.totalPharmacies || 0}</p>
            <span className="text-[11px] text-slate-500 mt-1 block">Registered branches</span>
          </div>
          <div className="bg-slate-800 border border-slate-700/80 rounded-xl p-4">
            <span className="text-xs font-medium text-slate-400">Active Branches</span>
            <p className="text-2xl font-extrabold text-emerald-400 mt-1">{stats.activePharmacies || 0}</p>
            <span className="text-[11px] text-emerald-500/80 mt-1 block">Operational</span>
          </div>
          <div className="bg-slate-800 border border-slate-700/80 rounded-xl p-4">
            <span className="text-xs font-medium text-slate-400">Suspended</span>
            <p className="text-2xl font-extrabold text-amber-400 mt-1">{stats.suspendedPharmacies || 0}</p>
            <span className="text-[11px] text-amber-500/80 mt-1 block">Access blocked</span>
          </div>
          <div className="bg-slate-800 border border-slate-700/80 rounded-xl p-4">
            <span className="text-xs font-medium text-slate-400">Pharmacists</span>
            <p className="text-2xl font-extrabold text-purple-400 mt-1">{stats.totalPharmacists || 0}</p>
            <span className="text-[11px] text-purple-400/80 mt-1 block">Accounts managed</span>
          </div>
        </div>

        {/* Pharmacies Management Section */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-5 border-b border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-white">Registered Pharmacies</h2>
              <p className="text-xs text-slate-400">Manage individual pharmacy accounts, credentials, and access</p>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-md transition cursor-pointer self-start sm:self-auto"
            >
              <span className="text-base leading-none font-bold">+</span> Create Pharmacy
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Loading pharmacies...
              </div>
            ) : pharmacies.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm font-semibold text-slate-300 mb-1">No pharmacies registered yet</p>
                <p className="text-xs text-slate-500 mb-4">Click below to create your first pharmacy and pharmacist account.</p>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  + Create First Pharmacy
                </button>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-700/60">
                  <tr>
                    <th className="py-3 px-4">Pharmacy & License</th>
                    <th className="py-3 px-4">Location & Contact</th>
                    <th className="py-3 px-4">Pharmacist Account</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {pharmacies.map((item) => (
                    <tr key={item._id} className="hover:bg-slate-700/30 transition">
                      <td className="py-3 px-4">
                        <span className="font-semibold text-white block">{item.name}</span>
                        <span className="text-[11px] text-slate-400 font-mono">Lic: {item.licenseNo}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-slate-300 block">{item.address}</span>
                        <span className="text-[11px] text-slate-500">{item.phone}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-200 block">{item.owner?.name || 'Unassigned'}</span>
                        <span className="text-[11px] text-slate-400 font-mono">{item.owner?.email || 'N/A'}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                            item.status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              item.status === 'active' ? 'bg-emerald-400' : 'bg-rose-400'
                            }`}
                          />
                          {item.status === 'active' ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => handleToggleStatus(item._id)}
                          disabled={actionLoading === item._id}
                          className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                            item.status === 'active'
                              ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/30'
                              : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30'
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
                          className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded text-[11px] font-medium transition cursor-pointer"
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
      </div>

      {/* Modal */}
      <CreatePharmacyModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={loadData}
      />
    </div>
  );
};

export default AdminDashboard;
