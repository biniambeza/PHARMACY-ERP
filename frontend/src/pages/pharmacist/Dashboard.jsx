import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';

const PharmacistDashboard = () => {
  const { user, logout } = useAuth();
  const [pharmacy, setPharmacy] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPharmacy = async () => {
      try {
        const res = await api.get('/pharmacy/my-pharmacy');
        setPharmacy(res.data.pharmacy);
      } catch (error) {
        console.error('Failed to load pharmacy profile:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPharmacy();
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 selection:bg-emerald-500 selection:text-white">
      <div className="max-w-4xl mx-auto">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-800 gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-1.5">
              Pharmacist Portal • Cashier & Inventory
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {pharmacy ? pharmacy.name : 'Pharmacy Dashboard'}
            </h1>
            <p className="text-xs text-slate-400">
              {pharmacy
                ? `${pharmacy.address} • Phone: ${pharmacy.phone}`
                : 'Manage medicines, point of sale, and stock inventory'}
            </p>
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

        {/* Pharmacy License Card */}
        {loading ? (
          <div className="p-6 text-center text-xs text-slate-400">Loading pharmacy profile...</div>
        ) : pharmacy ? (
          <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-sm">
                Rx
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">{pharmacy.name}</h3>
                <p className="text-xs text-slate-400 font-mono">License: {pharmacy.licenseNo}</p>
              </div>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              Active Pharmacy Tenant
            </div>
          </div>
        ) : null}

        {/* Integrated Modules Preview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Link
            to="/pharmacy/medicines"
            className="bg-slate-800 hover:bg-slate-700/60 border border-slate-700/80 hover:border-purple-500/50 rounded-xl p-5 transition cursor-pointer group block"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-slate-400">Medicine Catalog</span>
              <span className="text-[11px] text-purple-400 font-semibold group-hover:translate-x-0.5 transition">
                Open →
              </span>
            </div>
            <p className="text-xl font-bold text-white">Manage Products</p>
            <span className="text-[11px] text-purple-400 mt-1 block">Categories, pricing & units</span>
          </Link>
          <div className="bg-slate-800 border border-slate-700/80 rounded-xl p-5">
            <span className="text-xs font-medium text-slate-400">Phase 7: Inventory</span>
            <p className="text-xl font-bold text-white mt-1">Stock & Batches</p>
            <span className="text-[11px] text-blue-400 mt-1 block">Expiry dates & stock alerts</span>
          </div>
          <div className="bg-slate-800 border border-slate-700/80 rounded-xl p-5">
            <span className="text-xs font-medium text-slate-400">Phase 8: Cashier POS</span>
            <p className="text-xl font-bold text-white mt-1">Sales & Billing</p>
            <span className="text-[11px] text-emerald-400 mt-1 block">FEFO inventory deduction</span>
          </div>
        </div>

        {/* Isolation Confirmation */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-1">Data Isolation Confirmed (Phase 5)</h3>
          <p className="text-xs text-slate-400">
            Your account is bound to Pharmacy ID:{' '}
            <code className="text-emerald-400 font-mono">{pharmacy?._id || 'Loading...'}</code>. Every query in the upcoming modules will automatically filter by this ID.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PharmacistDashboard;
