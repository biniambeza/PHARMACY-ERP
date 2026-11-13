import { Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';

// Placeholder scaffolded by Foundation. Owner: Notify agent (#8).
const ResetPassword = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#f4f7fa] dark:bg-[#0d1117] p-6">
    <div className="w-full max-w-sm bg-white dark:bg-[#161c26] border border-slate-100/90 dark:border-slate-800/80 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-8 text-center">
      <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3 border border-emerald-100 dark:border-emerald-900/50">
        <KeyRound className="w-6 h-6" />
      </div>
      <h1 className="text-lg font-bold text-slate-900 dark:text-white">Reset Password</h1>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Coming soon</p>
      <Link to="/login" className="inline-block mt-5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
        Back to sign in
      </Link>
    </div>
  </div>
);

export default ResetPassword;
