import { useAuth } from '../../context/AuthContext';

const AdminDashboard = () => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-800 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20 mb-2">
              Administrator
            </div>
            <h1 className="text-2xl font-bold text-white">System Admin Dashboard</h1>
            <p className="text-xs text-slate-400">Manage pharmacies and overall system operations</p>
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

        {/* Overview Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-slate-800 border border-slate-700/80 rounded-xl p-5">
            <span className="text-xs font-medium text-slate-400">Pharmacies Module</span>
            <p className="text-xl font-bold text-white mt-1">Ready for Phase 4</p>
            <span className="text-[11px] text-emerald-400 mt-1 block">Account creation pipeline</span>
          </div>
          <div className="bg-slate-800 border border-slate-700/80 rounded-xl p-5">
            <span className="text-xs font-medium text-slate-400">Active Pharmacists</span>
            <p className="text-xl font-bold text-white mt-1">0</p>
            <span className="text-[11px] text-slate-500 mt-1 block">Created by Admin</span>
          </div>
          <div className="bg-slate-800 border border-slate-700/80 rounded-xl p-5">
            <span className="text-xs font-medium text-slate-400">System Status</span>
            <p className="text-xl font-bold text-emerald-400 mt-1">Operational</p>
            <span className="text-[11px] text-slate-500 mt-1 block">MongoDB Atlas Live</span>
          </div>
        </div>

        {/* Milestone info */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-1">Phase 3 Authentication Active</h3>
          <p className="text-xs text-slate-400">
            You are securely authenticated as an <strong className="text-purple-400">Admin</strong>. Protected and Role-based routing is verified.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
