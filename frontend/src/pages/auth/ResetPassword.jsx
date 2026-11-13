import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Lock, Eye, EyeOff, ArrowRight, ArrowLeft, AlertCircle, KeyRound } from 'lucide-react';
import { resetPasswordWithToken } from '../../api/authApi';
import LanguageSwitcher from '../../components/common/LanguageSwitcher';

const MIN_LENGTH = 8;

const inputClass =
  'w-full pl-10 pr-10 py-2.5 bg-slate-50/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { t } = useTranslation('auth');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < MIN_LENGTH) {
      setError(t('passwordMinLength', { min: MIN_LENGTH }));
      return;
    }
    if (password !== confirm) {
      setError(t('passwordsDontMatch'));
      return;
    }
    setLoading(true);
    try {
      await resetPasswordWithToken(token, password);
      navigate('/login?reset=success', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || t('resetFailed'));
    } finally {
      setLoading(false);
    }
  };

  const strength =
    password.length === 0
      ? null
      : password.length < MIN_LENGTH
        ? { label: t('strength.tooShort'), color: 'bg-rose-500', width: 'w-1/4' }
        : /[A-Z]/.test(password) && /\d/.test(password) && password.length >= 12
          ? { label: t('strength.strong'), color: 'bg-emerald-500', width: 'w-full' }
          : { label: t('strength.okay'), color: 'bg-amber-500', width: 'w-2/3' };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 bg-slate-50 dark:bg-[#0b0f17] font-sans selection:bg-emerald-500 selection:text-white overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-tr from-emerald-500/15 via-cyan-500/10 to-indigo-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none" />

      {/* Language picker (kept after sign-in: saved to localStorage) */}
      <div className="absolute top-4 right-4 z-20">
        <LanguageSwitcher showCalendar={false} />
      </div>

      <div className="relative z-10 w-full max-w-[390px] bg-white/95 dark:bg-[#141b26]/95 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-black/50 p-7 sm:p-8 transition-all">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center text-white shadow-lg shadow-emerald-500/25 mb-3.5">
            <KeyRound className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">{t('chooseNewPassword')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('signedOutNotice')}
          </p>
        </div>

        {!token ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span className="flex-1">{t('invalidResetLink')}</span>
            </div>
            <Link
              to="/forgot-password"
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2"
            >
              {t('requestNewLink')}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400 text-xs animate-fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span className="flex-1">
                  {error}
                  {/expired|invalid/i.test(error) && (
                    <>
                      {' '}
                      <Link to="/forgot-password" className="font-semibold underline">
                        {t('requestNewLink')}
                      </Link>
                    </>
                  )}
                </span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="reset-password" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('newPassword')}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="reset-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError('');
                    }}
                    placeholder={t('atLeastChars', { min: MIN_LENGTH })}
                    autoComplete="new-password"
                    required
                    className={inputClass}
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
                {strength && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full ${strength.color} ${strength.width} transition-all`} />
                    </div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">{strength.label}</span>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="reset-confirm" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('confirmPassword')}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="reset-confirm"
                    type={showPassword ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      if (error) setError('');
                    }}
                    placeholder={t('repeatNewPassword')}
                    autoComplete="new-password"
                    required
                    className={inputClass}
                  />
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
                    <span>{t('saving')}</span>
                  </>
                ) : (
                  <>
                    <span>{t('resetPassword')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </>
        )}

        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800/80 text-center">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t('backToLogin')}
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
