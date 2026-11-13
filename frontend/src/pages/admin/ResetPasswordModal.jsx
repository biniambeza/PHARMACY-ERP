import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, KeyRound, Loader2, Copy, Check, ShieldOff } from 'lucide-react';
import { adminResetUserPassword, adminResetUserTwoFactor } from '../../api/authApi';

// Admin password reset for a pharmacy user: one-time temporary password or an
// emailed reset link. The parent mounts it with a `key` per user.
const ResetPasswordModal = ({ user, onClose }) => {
  const { t } = useTranslation('admin');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const [twoFactorResult, setTwoFactorResult] = useState(null);

  if (!user) return null;

  const reset = async (mode) => {
    const confirmKey = mode === 'temp' ? 'resetPassword.confirmTemp' : 'resetPassword.confirmEmail';
    if (!window.confirm(t(confirmKey, { name: user.name, email: user.email }))) return;
    setBusy(true);
    setError('');
    try {
      setResult(await adminResetUserPassword(user._id, mode));
    } catch (err) {
      setError(err.response?.data?.message || t('resetPassword.failed'));
    } finally {
      setBusy(false);
    }
  };

  // Turns off the user's two-factor login (lost phone + recovery codes).
  const resetTwoFactor = async () => {
    if (!window.confirm(t('adminReset.confirm', { ns: 'security', name: user.name, email: user.email }))) return;
    setTwoFactorBusy(true);
    setError('');
    try {
      const res = await adminResetUserTwoFactor(user._id);
      setTwoFactorResult(res.wasEnabled ? t('adminReset.done', { ns: 'security' }) : t('adminReset.notEnabled', { ns: 'security' }));
    } catch (err) {
      setError(err.response?.data?.message || t('adminReset.failed', { ns: 'security' }));
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable: the password stays selectable
    }
  };

  const btn = 'px-4 py-2 text-xs font-semibold rounded-xl transition cursor-pointer disabled:opacity-50';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-[#161c26] rounded-2xl border border-slate-100 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 space-y-4 text-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <KeyRound className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('shared.resetPassword')}</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {user.name} ({user.email})
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {result ? (
          result.tempPassword ? (
            <div className="space-y-2">
              <p className="text-slate-600 dark:text-slate-300">
                {t('resetPassword.tempInfo')}
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={result.tempPassword}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 px-3 py-2 font-mono text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
                <button onClick={copy} title={t('resetPassword.copy')} className={`${btn} bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center gap-1.5`}>
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? t('resetPassword.copied') : t('resetPassword.copy')}
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`p-3 rounded-xl border ${
                result.emailSent
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800/60 dark:text-emerald-200'
                  : 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800/60 dark:text-amber-200'
              }`}
            >
              {result.message}
            </div>
          )
        ) : (
          <p className="text-slate-600 dark:text-slate-300">
            {t('resetPassword.choose')}
          </p>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        {/* Two-factor login reset */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-200">{t('adminReset.title', { ns: 'security' })}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('adminReset.hint', { ns: 'security' })}</p>
            </div>
            <button
              type="button"
              disabled={twoFactorBusy || Boolean(twoFactorResult)}
              onClick={resetTwoFactor}
              className={`${btn} shrink-0 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 inline-flex items-center gap-1.5`}
            >
              {twoFactorBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldOff className="w-3.5 h-3.5" />}
              {t('adminReset.button', { ns: 'security' })}
            </button>
          </div>
          {twoFactorResult && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800/60 dark:text-emerald-200">
              {twoFactorResult}
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {!result?.tempPassword && (
            <>
              <button disabled={busy} onClick={() => reset('email')} className={`${btn} border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800`}>
                {t('resetPassword.emailLink')}
              </button>
              <button disabled={busy} onClick={() => reset('temp')} className={`${btn} bg-amber-600 hover:bg-amber-500 text-white inline-flex items-center gap-1.5`}>
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {t('resetPassword.setTemp')}
              </button>
            </>
          )}
          <button onClick={onClose} className={`${btn} bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200`}>
            {result || twoFactorResult ? t('resetPassword.done') : t('buttons.cancel', { ns: 'common' })}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordModal;
