import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, ShieldAlert, Smartphone, KeyRound, Loader2, Copy, Check } from 'lucide-react';
import {
  getTwoFactorStatus,
  startTwoFactorSetup,
  enableTwoFactor,
  disableTwoFactor,
  regenerateRecoveryCodes,
} from '../../api/authApi';
import { useAuth } from '../../context/useAuth';
import { Alert, CardHeader } from './SettingsUi';
import { inputCls, cardCls, labelCls } from './settingsStyles';
import RecoveryCodesPanel from './RecoveryCodesPanel';
import { formatDate } from '../../utils/format';

const primaryBtn =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer';
const secondaryBtn =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold rounded-xl transition cursor-pointer disabled:opacity-50';
const dangerBtn =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition cursor-pointer';

const CodeInput = ({ id, label, value, onChange }) => (
  <div>
    <label htmlFor={id} className={labelCls}>
      {label}
    </label>
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      placeholder="123456"
      className={`${inputCls} font-mono tracking-[0.4em] text-center text-base`}
    />
  </div>
);

const PasswordInput = ({ id, label, value, onChange }) => (
  <div>
    <label htmlFor={id} className={labelCls}>
      {label}
    </label>
    <input
      id={id}
      type="password"
      autoComplete="current-password"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="••••••••"
      className={inputCls}
    />
  </div>
);

/**
 * Two-factor login (authenticator app) for the signed-in user: set up with a
 * QR code, confirm, show recovery codes once, regenerate them, or turn it off.
 * Works for every role (pharmacy staff and platform admins).
 */
const SecurityCard = ({ className = '' }) => {
  const { t } = useTranslation('security');
  const { user, updateSession } = useAuth();

  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState('');
  // idle | password | scan | codes | disable | regenerate
  const [step, setStep] = useState('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [setup, setSetup] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [keyCopied, setKeyCopied] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await getTwoFactorStatus();
      setStatus(res);
      setLoadError('');
    } catch (err) {
      setLoadError(err.response?.data?.message || t('loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    getTwoFactorStatus()
      .then((res) => {
        if (!cancelled) setStatus(res);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.response?.data?.message || t('loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const resetForm = () => {
    setPassword('');
    setCode('');
    setRecoveryCode('');
    setUseRecovery(false);
    setError('');
  };

  const go = (next) => {
    resetForm();
    setSuccess('');
    setStep(next);
  };

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.response?.data?.message || t('genericError'));
    } finally {
      setBusy(false);
    }
  };

  const handleStartSetup = (e) => {
    e.preventDefault();
    if (!password) return setError(t('passwordRequired'));
    return run(async () => {
      const res = await startTwoFactorSetup(password);
      setSetup(res);
      resetForm();
      setStep('scan');
    });
  };

  const handleEnable = (e) => {
    e.preventDefault();
    if (code.length !== 6) return setError(t('enterSixDigits'));
    return run(async () => {
      const res = await enableTwoFactor(code);
      setRecoveryCodes(res.recoveryCodes || []);
      setSetup(null);
      resetForm();
      setStep('codes');
      updateSession({ user: { twoFactorEnabled: true } });
      await loadStatus();
    });
  };

  const handleDisable = (e) => {
    e.preventDefault();
    if (!password) return setError(t('passwordRequired'));
    if (useRecovery ? !recoveryCode.trim() : code.length !== 6) {
      return setError(useRecovery ? t('enterRecoveryCode') : t('enterSixDigits'));
    }
    return run(async () => {
      await disableTwoFactor(
        useRecovery ? { password, recoveryCode: recoveryCode.trim() } : { password, code }
      );
      updateSession({ user: { twoFactorEnabled: false } });
      go('idle');
      setSuccess(t('disabledSuccess'));
      await loadStatus();
    });
  };

  const handleRegenerate = (e) => {
    e.preventDefault();
    if (!password) return setError(t('passwordRequired'));
    if (code.length !== 6) return setError(t('enterSixDigits'));
    return run(async () => {
      const res = await regenerateRecoveryCodes(password, code);
      setRecoveryCodes(res.recoveryCodes || []);
      resetForm();
      setStep('codes');
      await loadStatus();
    });
  };

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(setup.secret);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    } catch {
      // Clipboard unavailable: the key stays selectable
    }
  };

  const finishCodes = () => {
    setRecoveryCodes([]);
    go('idle');
    setSuccess(t('enabledSuccess'));
  };

  const enabled = Boolean(status?.enabled);
  const formattedKey = setup?.secret ? setup.secret.replace(/(.{4})/g, '$1 ').trim() : '';

  return (
    <div className={`${cardCls} ${className}`}>
      <CardHeader icon={ShieldCheck} color="indigo" title={t('title')} subtitle={t('subtitle')} />

      {loadError && <Alert type="error">{loadError}</Alert>}
      {success && <Alert type="success">{success}</Alert>}
      {error && <Alert type="error">{error}</Alert>}

      {!status && !loadError && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t('loading')}
        </div>
      )}

      {status && step === 'idle' && (
        <div className="space-y-4 text-xs">
          <div className="flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                enabled
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'
                  : 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400'
              }`}
            >
              {enabled ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
            </div>
            <div className="space-y-0.5">
              <p className="font-semibold text-slate-900 dark:text-white">{enabled ? t('statusOn') : t('statusOff')}</p>
              <p className="text-slate-500 dark:text-slate-400">
                {enabled
                  ? t('enabledSince', { date: status.enabledAt ? formatDate(status.enabledAt) : '-' })
                  : t('explain')}
              </p>
              {enabled && (
                <p className={status.recoveryCodesRemaining <= 2 ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-slate-500 dark:text-slate-400'}>
                  {t('codesRemaining', { count: status.recoveryCodesRemaining })}
                </p>
              )}
            </div>
          </div>

          {!enabled && status.recommended && (
            <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-indigo-800 dark:text-indigo-200">
              {user?.role === 'admin' ? t('recommendedAdmin') : t('recommendedOwner')}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {enabled ? (
              <>
                <button type="button" onClick={() => go('regenerate')} className={secondaryBtn}>
                  <KeyRound className="w-4 h-4" />
                  {t('newRecoveryCodes')}
                </button>
                <button type="button" onClick={() => go('disable')} className={secondaryBtn}>
                  {t('turnOff')}
                </button>
              </>
            ) : (
              <button type="button" onClick={() => go('password')} className={primaryBtn}>
                <Smartphone className="w-4 h-4" />
                {t('setUp')}
              </button>
            )}
          </div>
        </div>
      )}

      {step === 'password' && (
        <form onSubmit={handleStartSetup} className="space-y-3 text-xs">
          <p className="text-slate-600 dark:text-slate-300">{t('setupIntro')}</p>
          <PasswordInput id="sec-setup-pw" label={t('currentPassword')} value={password} onChange={setPassword} />
          <div className="flex gap-2">
            <button type="button" onClick={() => go('idle')} className={secondaryBtn}>
              {t('cancel')}
            </button>
            <button type="submit" disabled={busy} className={primaryBtn}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('continue')}
            </button>
          </div>
        </form>
      )}

      {step === 'scan' && setup && (
        <form onSubmit={handleEnable} className="space-y-4 text-xs">
          <ol className="list-decimal pl-4 space-y-1 text-slate-600 dark:text-slate-300">
            <li>{t('scanStep1')}</li>
            <li>{t('scanStep2')}</li>
            <li>{t('scanStep3')}</li>
          </ol>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <img
              src={setup.qrCode}
              alt={t('qrAlt')}
              width={176}
              height={176}
              className="w-44 h-44 rounded-xl bg-white p-2 border border-slate-200 dark:border-slate-700"
            />
            <div className="flex-1 w-full space-y-1.5">
              <span className="block text-slate-500 dark:text-slate-400">{t('manualKey')}</span>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 font-mono text-[11px] break-all text-slate-900 dark:text-white select-all">
                  {formattedKey}
                </code>
                <button type="button" onClick={copyKey} title={t('copyKey')} className={`${secondaryBtn} px-2.5`}>
                  {keyCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <span className="block text-[10px] text-slate-400">{t('manualKeyHint', { issuer: setup.issuer || '' })}</span>
            </div>
          </div>
          <CodeInput id="sec-enable-code" label={t('codeFromApp')} value={code} onChange={setCode} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setSetup(null);
                go('idle');
              }}
              className={secondaryBtn}
            >
              {t('cancel')}
            </button>
            <button type="submit" disabled={busy} className={primaryBtn}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('verifyAndEnable')}
            </button>
          </div>
        </form>
      )}

      {step === 'codes' && recoveryCodes.length > 0 && (
        <RecoveryCodesPanel codes={recoveryCodes} email={user?.email} onDone={finishCodes} />
      )}

      {step === 'disable' && (
        <form onSubmit={handleDisable} className="space-y-3 text-xs">
          <p className="text-slate-600 dark:text-slate-300">{t('disableIntro')}</p>
          <PasswordInput id="sec-disable-pw" label={t('currentPassword')} value={password} onChange={setPassword} />
          {useRecovery ? (
            <div>
              <label htmlFor="sec-disable-recovery" className={labelCls}>
                {t('recoveryCode')}
              </label>
              <input
                id="sec-disable-recovery"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                placeholder="xxxxx-xxxxx"
                className={`${inputCls} font-mono`}
              />
            </div>
          ) : (
            <CodeInput id="sec-disable-code" label={t('codeFromApp')} value={code} onChange={setCode} />
          )}
          <button
            type="button"
            onClick={() => {
              setUseRecovery((v) => !v);
              setCode('');
              setRecoveryCode('');
              setError('');
            }}
            className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
          >
            {useRecovery ? t('useAuthenticator') : t('useRecoveryCode')}
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={() => go('idle')} className={secondaryBtn}>
              {t('cancel')}
            </button>
            <button type="submit" disabled={busy} className={dangerBtn}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('confirmTurnOff')}
            </button>
          </div>
        </form>
      )}

      {step === 'regenerate' && (
        <form onSubmit={handleRegenerate} className="space-y-3 text-xs">
          <p className="text-slate-600 dark:text-slate-300">{t('regenerateIntro')}</p>
          <PasswordInput id="sec-regen-pw" label={t('currentPassword')} value={password} onChange={setPassword} />
          <CodeInput id="sec-regen-code" label={t('codeFromApp')} value={code} onChange={setCode} />
          <div className="flex gap-2">
            <button type="button" onClick={() => go('idle')} className={secondaryBtn}>
              {t('cancel')}
            </button>
            <button type="submit" disabled={busy} className={primaryBtn}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('generate')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default SecurityCard;
