import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, KeyRound, ArrowLeft, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const inputCls =
  'w-full px-3.5 py-2.5 bg-slate-50/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition';

/**
 * Second sign-in step for accounts with two-factor login: a 6-digit code from
 * the authenticator app, or a one-time recovery code.
 * onSuccess(user) is called with the signed-in user; onExpired(message) when
 * the sign-in attempt expired and the user has to enter the password again.
 */
const TwoFactorLoginStep = ({ onSuccess, onExpired }) => {
  const { t } = useTranslation('auth');
  const { completeTwoFactor, cancelTwoFactor, twoFactorEmail, loading } = useAuth();
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (useRecovery ? !recoveryCode.trim() : code.length !== 6) {
      setError(useRecovery ? t('twoFactor.enterRecoveryCode') : t('twoFactor.enterSixDigits'));
      return;
    }
    const res = await completeTwoFactor(useRecovery ? { recoveryCode: recoveryCode.trim() } : { code });
    if (res.success) {
      onSuccess(res.user);
    } else if (res.expired) {
      // AuthContext cleared the challenge: Login shows step 1 again
      onExpired?.(t('twoFactor.expired'));
    } else if (res.status === 429 || res.status === 403) {
      setError(res.message);
    } else {
      setError(useRecovery ? t('twoFactor.invalidRecoveryCode') : t('twoFactor.invalidCode'));
      setCode('');
    }
  };

  const toggleMode = () => {
    setUseRecovery((v) => !v);
    setError('');
    setCode('');
    setRecoveryCode('');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center text-center">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2">
          {useRecovery ? <KeyRound className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
        </div>
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">{t('twoFactor.title')}</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {useRecovery ? t('twoFactor.recoveryHint') : t('twoFactor.codeHint')}
        </p>
        {twoFactorEmail && <p className="text-[11px] text-slate-400 mt-1 font-medium">{twoFactorEmail}</p>}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {useRecovery ? (
          <div>
            <label htmlFor="twofa-recovery" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {t('twoFactor.recoveryCodeLabel')}
            </label>
            <input
              id="twofa-recovery"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              placeholder="xxxxx-xxxxx"
              className={`${inputCls} font-mono text-sm tracking-wider`}
            />
          </div>
        ) : (
          <div>
            <label htmlFor="twofa-code" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {t('twoFactor.codeLabel')}
            </label>
            <input
              id="twofa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className={`${inputCls} text-center font-mono text-lg tracking-[0.5em]`}
            />
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] disabled:opacity-50 text-white text-xs sm:text-sm font-semibold rounded-xl transition shadow-xs flex items-center justify-center gap-2 cursor-pointer"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>{t('twoFactor.verifying')}</span>
            </>
          ) : (
            <>
              <span>{t('twoFactor.verify')}</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="flex items-center justify-between text-[11px] pt-1">
        <button
          type="button"
          onClick={cancelTwoFactor}
          className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t('backToLogin')}
        </button>
        <button
          type="button"
          onClick={toggleMode}
          className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
        >
          {useRecovery ? t('twoFactor.useAuthenticator') : t('twoFactor.useRecoveryCode')}
        </button>
      </div>
      {useRecovery && <p className="text-[10px] text-slate-400 text-center">{t('twoFactor.lostEverything')}</p>}
    </div>
  );
};

export default TwoFactorLoginStep;
