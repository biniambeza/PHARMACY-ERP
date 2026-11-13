import { useEffect } from 'react';
import { CloudUpload, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Warning before logout / branch switch while the signed-in user has offline sales that are
 * not synced yet (they stay in this browser until that user is back on this branch).
 * Props: { open, kind: 'logout' | 'switchBranch', count, othersCount, online, syncing, onSync, onCancel, onContinue }
 */
const UnsyncedSalesDialog = ({ open, kind, count, othersCount = 0, online, syncing, onSync, onCancel, onContinue }) => {
  const { t } = useTranslation('ui');

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsynced-title"
        aria-describedby="unsynced-text"
        className="w-full max-w-md bg-white dark:bg-[#161c26] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl"
      >
        <div className="px-5 py-4 space-y-2">
          <h3 id="unsynced-title" className="text-sm font-bold text-slate-900 dark:text-white inline-flex items-center gap-2">
            <CloudUpload className="w-4 h-4 text-amber-500" /> {t('unsynced.title')}
          </h3>
          <p id="unsynced-text" className="text-xs text-slate-600 dark:text-slate-300">
            {kind === 'switchBranch' ? t('unsynced.switchBranch', { count }) : t('unsynced.logout', { count })}
          </p>
          {othersCount > 0 && <p className="text-[11px] text-slate-400">{t('unsynced.others', { count: othersCount })}</p>}
          {count > 0 && online && (
            <button
              type="button"
              onClick={onSync}
              disabled={syncing}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-500 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /> {t('unsynced.syncNow')}
            </button>
          )}
        </div>
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl cursor-pointer"
          >
            {t('unsynced.cancel')}
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl cursor-pointer"
          >
            {t('unsynced.continue')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UnsyncedSalesDialog;
