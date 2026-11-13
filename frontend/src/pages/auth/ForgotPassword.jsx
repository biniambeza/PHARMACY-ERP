import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mail, ArrowRight, ArrowLeft, AlertCircle, KeyRound, MailCheck } from 'lucide-react';
import { requestPasswordReset } from '../../api/authApi';
import LanguageSwitcher from '../../components/common/LanguageSwitcher';

const inputClass =
  'w-full pl-10 pr-3.5 py-2.5 bg-slate-50/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const { t } = useTranslation('auth');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError(t('enterEmail'));
      return;
    }
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.message || t('resetEmailFailed'));
    } finally {
      setLoading(false);
    }
  };

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
            {sent ? <MailCheck className="w-6 h-6" /> : <KeyRound className="w-6 h-6" />}
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            {sent ? t('checkEmail') : t('forgotPassword')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {sent
              ? t('resetEmailSentBody', { minutes: 30 })
              : t('forgotIntro')}
          </p>
        </div>

        {error && (
          <div id="forgot-error" role="alert" className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400 text-xs animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" aria-hidden="true" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {sent ? (
          <div className="space-y-3">
            <p className="text-[11px] text-center text-slate-500 dark:text-slate-400">
              {t('didntGetIt')}
            </p>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold rounded-xl transition cursor-pointer"
            >
              {t('sendAgain')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="forgot-email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('emailLabel')}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="name@pharmacy.com"
                  autoComplete="email"
                  required
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'forgot-error' : undefined}
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
                  <span>{t('sending')}</span>
                </>
              ) : (
                <>
                  <span>{t('sendResetLink')}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
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

export default ForgotPassword;
