import { useState } from 'react';
import { WifiOff, RefreshCw, CloudUpload, AlertTriangle, Trash2, RotateCcw } from 'lucide-react';
import PosModal from './PosModal';
import { formatMoney, formatDateTime } from '../../utils/format';
import { removeFromQueue, retryEntry } from '../../offline/queue';

/**
 * Offline banner + pending-sync counter + review list of failed offline sales (#27).
 * Props: { online, pending, failed, syncing, onSync, catalogSavedAt }
 */
const OfflinePanel = ({ online, pending, failed, syncing, onSync, catalogSavedAt }) => {
  const [reviewOpen, setReviewOpen] = useState(false);
  const total = pending.length + failed.length;

  if (online && total === 0) return null;

  return (
    <>
      {!online && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>
            <b>Offline mode.</b> Cash sales are saved on this device and synced automatically when the connection returns.
            Credit, mobile money and controlled medicines are unavailable.
            {catalogSavedAt ? ` Stock as of ${formatDateTime(catalogSavedAt)}.` : ''}
          </span>
        </div>
      )}
      {total > 0 && (
        <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 text-sky-800 dark:text-sky-200 text-xs flex flex-wrap items-center gap-2">
          <CloudUpload className="w-4 h-4" />
          <span>
            <b>{pending.length}</b> sale(s) waiting to sync
            {failed.length > 0 && (
              <>
                , <b className="text-rose-600">{failed.length} failed</b>
              </>
            )}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {failed.length > 0 && (
              <button type="button" onClick={() => setReviewOpen(true)} className="font-semibold text-rose-600 hover:underline cursor-pointer">
                Review
              </button>
            )}
            <button
              type="button"
              disabled={!online || syncing}
              onClick={onSync}
              className="inline-flex items-center gap-1 font-semibold disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /> Sync now
            </button>
          </div>
        </div>
      )}

      <PosModal open={reviewOpen} title="Offline sales that could not be synced" icon={AlertTriangle} onClose={() => setReviewOpen(false)} wide>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          These sales were made offline but the server rejected them (for example, the stock was sold elsewhere).
          Collect or refund the money as needed, then retry or discard each one.
        </p>
        {failed.length === 0 ? (
          <p className="text-xs text-center text-slate-500 py-6">Nothing to review.</p>
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
                    <div className="text-[11px] text-rose-600 mt-1">{e.error}{e.code ? ` (${e.code})` : ''}</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{e.offlineId}</div>
                  </div>
                  <button type="button" onClick={() => retryEntry(e.offlineId)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 cursor-pointer">
                    <RotateCcw className="w-3 h-3" /> Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Discard this offline sale? It will not be recorded.')) removeFromQueue(e.offlineId);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" /> Discard
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
