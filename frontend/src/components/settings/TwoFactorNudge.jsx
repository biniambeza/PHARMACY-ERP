import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ShieldAlert, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getTwoFactorStatus } from '../../api/authApi';

const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
const storageKey = (userId) => `twoFactorNudgeDismissed:${userId}`;

const isSnoozed = (userId) => {
  try {
    const at = Number(localStorage.getItem(storageKey(userId)));
    return Boolean(at) && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
};

/**
 * Dismissible "Protect your account with two-factor login" banner for pharmacy
 * owners and platform admins who have not turned on 2FA. Pass `to` (a route,
 * e.g. '/pharmacy/settings') or `onAction` (e.g. open a modal).
 */
const TwoFactorNudge = ({ to, onAction, className = '' }) => {
  const { t } = useTranslation('security');
  const { user, isAdmin, memberships } = useAuth();
  const userId = user?._id;
  const recommended = isAdmin || (memberships || []).some((m) => m.role === 'owner' && m.active !== false);

  const [dismissed, setDismissed] = useState(() => (userId ? isSnoozed(userId) : true));
  const [serverEnabled, setServerEnabled] = useState(null);
  const knownEnabled = typeof user?.twoFactorEnabled === 'boolean' ? user.twoFactorEnabled : serverEnabled;

  // Sessions stored before 2FA existed have no `twoFactorEnabled`: ask the server.
  useEffect(() => {
    if (!userId || !recommended || dismissed || typeof user?.twoFactorEnabled === 'boolean') return undefined;
    let cancelled = false;
    getTwoFactorStatus()
      .then((res) => {
        if (!cancelled) setServerEnabled(Boolean(res.enabled));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId, recommended, dismissed, user?.twoFactorEnabled]);

  if (!userId || !recommended || dismissed || knownEnabled !== false) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(storageKey(userId), String(Date.now()));
    } catch {
      // ignore
    }
    setDismissed(true);
  };

  const actionCls =
    'px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap';

  return (
    <div
      role="status"
      className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 rounded-2xl border bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/60 text-indigo-900 dark:text-indigo-100 text-xs ${className}`}
    >
      <ShieldAlert className="w-5 h-5 shrink-0 text-indigo-600 dark:text-indigo-400" />
      <div className="flex-1">
        <p className="font-semibold">{t('nudge.title')}</p>
        <p className="text-indigo-700/80 dark:text-indigo-200/80">{isAdmin ? t('nudge.bodyAdmin') : t('nudge.bodyOwner')}</p>
      </div>
      <div className="flex items-center gap-2">
        {to ? (
          <Link to={to} className={actionCls}>
            {t('nudge.action')}
          </Link>
        ) : (
          onAction && (
            <button type="button" onClick={onAction} className={actionCls}>
              {t('nudge.action')}
            </button>
          )
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('nudge.dismiss')}
          title={t('nudge.dismiss')}
          className="p-1.5 rounded-lg text-indigo-500 hover:text-indigo-800 dark:hover:text-white hover:bg-indigo-100 dark:hover:bg-indigo-900/50 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default TwoFactorNudge;
