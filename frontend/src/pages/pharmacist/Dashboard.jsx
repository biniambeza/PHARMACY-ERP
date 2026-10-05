import { useAuth } from '../../context/AuthContext';

const PharmacistDashboard = () => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-800 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
              Pharmacist • Cashier & Inventory
            </div>
            <h1 className="text-2xl font-bold text-white">Pharmacy Dashboard</h1>
            <p className="text-xs text-slate-400">Point of Sale, Stock Management, and Inventory</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <span className="block text-xs font-medium text-slate-300">{user?.name}</span>
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

        {/* Quick Modules Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-slate-800 border border-slate-700/80 rounded-xl p-5">
            <span className="text-xs font-medium text-slate-400">Cashier (POS)</span>
            <p className="text-xl font-bold text-white mt-1">Ready for Phase 8</p>
            <span className="text-[11px] text-emerald-400 mt-1 block">Sales & Billing integrated</span>
          </div>
          <div className="bg-slate-800 border border-slate-700/80 rounded-xl p-5">
            <span className="text-xs font-medium text-slate-400">Inventory & Stock</span>
            <p className="text-xl font-bold text-white mt-1">Ready for Phase 7</p>
            <span className="text-[11px] text-blue-400 mt-1 block">Batches & Expiry tracking</span>
          </div>
          <div className="bg-slate-800 border border-slate-700/80 rounded-xl p-5">
            <span className="text-xs font-medium text-slate-400">Medicines Catalog</span>
            <p className="text-xl font-bold text-white mt-1">Ready for Phase 6</p>
            <span className="text-[11px] text-purple-400 mt-1 block">Isolated per Pharmacy</span>
          </div>
        </div>

        {/* Information Card */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-1">Pharmacist Portal Active</h3>
          <p className="text-xs text-slate-400">
            You are logged in with the combined Pharmacist role (Cashier + Inventory). Data will be isolated by your specific Pharmacy ID.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PharmacistDashboard;
