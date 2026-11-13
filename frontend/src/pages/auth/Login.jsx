import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Navigate, Link, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import TwoFactorLoginStep from '../../components/auth/TwoFactorLoginStep';
import { Mail, Lock, Eye, EyeOff, ArrowRight, AlertCircle, Pill, Info, CheckCircle2 } from 'lucide-react';
import LanguageSwitcher from '../../components/common/LanguageSwitcher';

// Demo quick-fill buttons: local development only, credentials come from
// frontend/.env (never committed). Format: VITE_DEMO_PHARMACIST=email:password
const parseDemo = (value) => {
  const raw = String(value || '');
  const i = raw.indexOf(':');
  return i > 0 ? { email: raw.slice(0, i), password: raw.slice(i + 1) } : null;
};
const DEMO_ACCOUNTS = import.meta.env.DEV
  ? [
      { key: 'demoPharmacist', account: parseDemo(import.meta.env.VITE_DEMO_PHARMACIST) },
      { key: 'demoAdmin', account: parseDemo(import.meta.env.VITE_DEMO_ADMIN) },
    ].filter((d) => d.account)
  : [];

// The page the user was sent away from (ProtectedRoute passes it as location.state.from).
// Only same-app paths are accepted: must start with '/' but not '//' or '/' (protocol-relative URLs).
const safeReturnPath = (from) => {
  const path = typeof from === 'string' ? from : from ? `${from.pathname || ''}${from.search || ''}${from.hash || ''}` : '';
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return null;
  if (path === '/' || path.startsWith('/login')) return null;
  return path;
};

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const { t } = useTranslation('auth');
  const { login, loading, isAuthenticated, user, twoFactorPending } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  // ProtectedRoute passes state.from; the session-expired redirect (api/axios.js) passes ?from=
  const returnTo = safeReturnPath(location.state?.from) || safeReturnPath(searchParams.get('from'));
  const homeFor = (u) => returnTo || (u?.role === 'admin' ? '/admin' : '/pharmacy');
  const sessionExpired = searchParams.get('session') === 'expired';
  const passwordReset = searchParams.get('reset') === 'success';

  if (isAuthenticated) {
    return <Navigate to={homeFor(user)} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError(t('fillAllFields'));
      return;
    }
    const res = await login(email, password);
    if (res.twoFactorRequired) {
      // Second step (authenticator code) is rendered below
      setPassword('');
    } else if (res.success) {
      navigate(homeFor(res.user), { replace: true });
    } else {
      setError(res.message);
    }
  };

  const handleDemoFill = (demoEmail, demoPassword) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError('');
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 bg-slate-50 dark:bg-[#0b0f17] font-sans selection:bg-emerald-500 selection:text-white overflow-hidden">
      {/* Ambient background glow & subtle pattern */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-tr from-emerald-500/15 via-cyan-500/10 to-indigo-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none" />

      {/* Language picker (kept after sign-in: saved to localStorage) */}
      <div className="absolute top-4 right-4 z-20">
        <LanguageSwitcher showCalendar={false} />
      </div>

      {/* Main Login Card */}
      <div className="relative z-10 w-full max-w-[390px] bg-white/95 dark:bg-[#141b26]/95 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-black/50 p-7 sm:p-8 transition-all">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center text-white shadow-lg shadow-emerald-500/25 mb-3.5">
            <Pill className="w-6 h-6 rotate-45" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            {t('welcomeBack')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('signInSubtitle')}
          </p>
        </div>

        {twoFactorPending ? (
          <TwoFactorLoginStep
            onSuccess={(signedIn) => navigate(homeFor(signedIn), { replace: true })}
            onExpired={setError}
          />
        ) : (
        <>
        {/* Session / reset notices */}
        {passwordReset && !error && (
          <div role="status" className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400 text-xs animate-fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            <span className="flex-1">{t('passwordResetSuccess')}</span>
          </div>
        )}
        {sessionExpired && !passwordReset && !error && (
          <div role="status" className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-400 text-xs animate-fade-in">
            <Info className="w-4 h-4 shrink-0 text-amber-500" />
            <span className="flex-1">{t('sessionExpired')}</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div id="login-error" role="alert" className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400 text-xs animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" aria-hidden="true" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {t('emailLabel')}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'login-error' : undefined}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError('');
                }}
                placeholder="name@pharmacy.com"
                required
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {t('password')}
              </label>
              <Link
                to="/forgot-password"
                className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                {t('forgotPassword')}
              </Link>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'login-error' : undefined}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder={t('enterPassword')}
                required
                className="w-full pl-10 pr-10 py-2.5 bg-slate-50/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
                aria-label={showPassword ? t('hidePassword') : t('showPassword')}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] disabled:opacity-50 text-white text-xs sm:text-sm font-semibold rounded-xl transition shadow-xs flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{t('signingIn')}</span>
              </>
            ) : (
              <>
                <span>{t('signInButton')}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Quick Demo Fill (local development only) */}
          {DEMO_ACCOUNTS.length > 0 && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>{t('demoAccounts')}</span>
              <div className="flex items-center gap-1.5">
                {DEMO_ACCOUNTS.map(({ key, account }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleDemoFill(account.email, account.password)}
                    className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition cursor-pointer"
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
        </>
        )}
      </div>
    </div>
  );
};

export default Login;
