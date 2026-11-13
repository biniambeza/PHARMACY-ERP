import { useState } from 'react';
import { WifiOff, RefreshCw, CloudUpload, AlertTriangle, Trash2, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PosModal from './PosModal';
import { formatMoney, formatDateTime } from '../../utils/format';
import { removeFromQueue, retryEntry } from '../../offline/queue';

// Fallback errors stored by offline/queue.js (server messages are shown as-is)
const QUEUE_ERRORS = { 'Sync failed': 'offline.syncFailed', 'Not processed': 'offline.notProcessed' };

/**
 * Offline banner + pending-sync counter + review list of failed offline sales (#27).
 * Props: { online, pending, failed, othersCount, syncing, onSync, catalogSavedAt }
 *   pending / failed: the signed-in user's queued sales; othersCount: sales other users left on
 *   this device (synced when they sign in again).
 */
const OfflinePanel = ({ online, pending, failed, othersCount = 0, syncing, onSync, catalogSavedAt }) => {
  const { t } = useTranslation('pos');
  const [reviewOpen, setReviewOpen] = useState(false);
  const total = pending.length + failed.length;

  if (online && total === 0 && othersCount === 0) return null;

  return (
    <>
      {!online && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>
            <b>{t('offline.modeTitle')}</b>{t('offline.modeText')}
            {catalogSavedAt ? t('offline.stockAsOf', { time: formatDateTime(catalogSavedAt) }) : ''}
          </span>
        </div>
      )}
      {total === 0 && othersCount > 0 && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 px-1">{t('offline.others', { count: othersCount })}</p>
      )}
      {total > 0 && (
        <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 text-sky-800 dark:text-sky-200 text-xs flex flex-wrap items-center gap-2">
          <CloudUpload className="w-4 h-4" />
          <span>
            <b>{pending.length}</b> {t('offline.waiting', { count: pending.length })}
            {failed.length > 0 && (
              <>
                , <b className="text-rose-600">{t('offline.failed', { count: failed.length })}</b>
              </>
            )}
            {othersCount > 0 && <span className="opacity-75"> · {t('offline.others', { count: othersCount })}</span>}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {failed.length > 0 && (
              <button type="button" onClick={() => setReviewOpen(true)} className="font-semibold text-rose-600 hover:underline cursor-pointer">
                {t('offline.review')}
              </button>
            )}
            <button
              type="button"
              disabled={!online || syncing}
              onClick={onSync}
              className="inline-flex items-center gap-1 font-semibold disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /> {t('offline.syncNow')}
            </button>
          </div>
        </div>
      )}

      <PosModal open={reviewOpen} title={t('offline.reviewTitle')} icon={AlertTriangle} onClose={() => setReviewOpen(false)} wide>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          {t('offline.reviewHint')}
        </p>
        {failed.length === 0 ? (
          <p className="text-xs text-center text-slate-500 py-6">{t('offline.nothing')}</p>
        ) : (
          <ul className="space-y-2">
            {failed.map((e) => (
              <li key={e.offlineId} className="p-3 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">
                      {formatDateTime(e.createdAtClient)} · {formatMoney(e.summary?.grandTotal || 0)}
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                      {(e.summary?.lines || []).map((l) => `${l.quantity} ${l.unitName} ${l.name}`).join(', ')}
                    </div>
                    <div className="text-[11px] text-rose-600 mt-1">{QUEUE_ERRORS[e.error] ? t(QUEUE_ERRORS[e.error]) : e.error}{e.code ? ` (${e.code})` : ''}</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{e.offlineId}</div>
                  </div>
                  <button type="button" onClick={() => retryEntry(e.offlineId)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 cursor-pointer">
                    <RotateCcw className="w-3 h-3" /> {t('offline.retry')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(t('offline.confirmDiscard'))) removeFromQueue(e.offlineId);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" /> {t('offline.discard')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PosModal>
    </>
  );
};

export default OfflinePanel;
