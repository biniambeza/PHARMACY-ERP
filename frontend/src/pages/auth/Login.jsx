import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const { login, loading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  if (isAuthenticated) {
    return <Navigate to={user?.role === 'admin' ? '/admin' : '/pharmacy'} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    const res = await login(email, password);
    if (res.success) {
      navigate(res.user.role === 'admin' ? '/admin' : '/pharmacy');
    } else {
      setError(res.message);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#f4f7fa] dark:bg-[#0d1117] font-sans selection:bg-teal-500 selection:text-white">
      {/* Left Branding Panel */}
      <div className="hidden lg:flex lg:w-[44%] bg-[#1c222f] relative overflow-hidden flex-col justify-between p-10">
        {/* Decorative gradients */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px]" />

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-500 to-cyan-500 flex items-center justify-center text-white font-extrabold text-lg shadow-lg shadow-teal-500/20">
              Rx
            </div>
            <div>
              <p className="text-sm font-bold text-white tracking-tight leading-none">Pharmacy ERP</p>
              <p className="text-[11px] text-teal-400 font-medium tracking-wider uppercase">Enterprise Edition</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 space-y-8">
          <div>
            <h1 className="text-[32px] font-extrabold text-white leading-tight tracking-tight">
              Unified
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-400">Pharmacy</span>
              <br />
              Operations.
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed mt-4 max-w-sm">
              Multi-tenant dispensary, inventory, procurement and financial intelligence — isolated per pharmacy, governed centrally.
            </p>
          </div>

          <div className="space-y-3 max-w-sm">
            {[
              'FEFO batch tracking & expiry governance',
              'POS with automatic stock deduction',
              'Procurement lifecycle & supplier ledger',
              'Real-time revenue, COGS & margin analytics',
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm text-slate-300">
                <span className="w-6 h-6 rounded-full bg-teal-500/15 border border-teal-500/20 flex items-center justify-center shrink-0">
                  <svg className="w-3.5 h-3.5 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <span className="text-xs font-medium text-slate-300">{item}</span>
              </div>
            ))}
          </div>

          {/* Mini preview card */}
          <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-4 flex items-center gap-4 max-w-sm">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-[#1c222f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white">Live financial overview</p>
              <p className="text-[11px] text-slate-400">Revenue vs procurement, FEFO health & supplier spend — all tenant-isolated.</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-[11px] text-slate-500 border-t border-white/10 pt-6">
          <span>© {new Date().getFullYear()} Pharmacy ERP Systems</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Secure & Compliant
          </span>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 lg:p-10 bg-[#f4f7fa] dark:bg-[#0d1117]">
        <div className="w-full max-w-[420px]">
          {/* Mobile brand */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-500 to-cyan-500 flex items-center justify-center text-white font-extrabold shadow-md">Rx</div>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white leading-none">Pharmacy ERP</p>
              <p className="text-[11px] text-teal-600 dark:text-teal-400 font-semibold uppercase tracking-wider">Enterprise Edition</p>
            </div>
          </div>

          <div className="bg-white dark:bg-[#161c26] rounded-[20px] border border-slate-200/70 dark:border-slate-800 shadow-[0_8px_30px_rgba(0,0,0,0.06)] p-7 sm:p-8">
            <div className="mb-6">
              <h2 className="text-[22px] font-extrabold text-slate-900 dark:text-white tracking-tight leading-none">Welcome back</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Sign in to your workspace. Your data is strictly tenant-isolated.</p>
            </div>

            {error && (
              <div className="mb-5 flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400 text-xs leading-relaxed">
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Email address</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@pharmacy.com"
                    required
                    className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Password</label>
                  <span className="text-[11px] text-slate-400">Secure authentication</span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06A1.65 1.65 0 0015 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 009 15a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 0013 9.6a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 15z" />
                    </svg>
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    className="w-full pl-9 pr-10 py-2.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-[#0f766e] hover:bg-[#0d5e58] disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition shadow-sm flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </>
                )}
              </button>

              <div className="flex items-center gap-3 py-1">
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                <span className="text-[11px] text-slate-400 font-medium">Tenant-isolated access</span>
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              </div>

              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/70 dark:border-slate-800 p-3">
                  <p className="font-semibold text-slate-700 dark:text-slate-200">Admin</p>
                  <p className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">System governance & tenancies</p>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/70 dark:border-slate-800 p-3">
                  <p className="font-semibold text-slate-700 dark:text-slate-200">Pharmacist</p>
                  <p className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">Dispensary & inventory control</p>
                </div>
              </div>
            </form>

            <p className="text-[11px] text-center text-slate-400 mt-6">
              Authorized access only. All actions are audited per tenant scope.
            </p>
          </div>

          <p className="text-center text-[11px] text-slate-400 mt-4">
            Need access? Contact your system administrator for provisioning.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
