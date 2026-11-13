import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Clock, PlayCircle, Keyboard, Wifi, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '../../utils/format';

/**
 * POS page header: shift badge, online state, held sales, sales history and the
 * keyboard-shortcut help panel.
 * Props: { shift, online, pendingCount, heldCount, onOpenShift(), onOpenHeld() }
 */
const PosHeader = ({ shift, online, pendingCount, heldCount, onOpenShift, onOpenHeld }) => {
  const { t } = useTranslation('pos');
  const [showHelp, setShowHelp] = useState(false);

  return (
    <>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 uppercase tracking-wider">
            {t('header.badge')}
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">{t('header.title')}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {shift ? (
            <Link
              to="/pharmacy/shifts"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60"
              title={t('header.shiftDetails')}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {t('header.shiftSince', { number: shift.shiftNumber, time: formatDateTime(shift.openedAt) })}
            </Link>
          ) : (
            <button
              type="button"
              onClick={onOpenShift}
              disabled={!online}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 cursor-pointer disabled:opacity-60"
            >
              <Clock className="w-3.5 h-3.5" /> {t('header.noShift')}
            </button>
          )}
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border ${
              online
                ? 'text-slate-500 border-slate-200 dark:border-slate-700'
                : 'text-amber-700 bg-amber-50 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
            }`}
          >
            {online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {online ? t('header.online') : t('header.offline')}
            {pendingCount > 0 && <span className="ml-1 px-1.5 rounded-full bg-sky-600 text-white">{pendingCount}</span>}
          </span>
          <button
            type="button"
            onClick={onOpenHeld}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
          >
            <PlayCircle className="w-3.5 h-3.5" /> {t('header.held', { count: heldCount })}
          </button>
          <Link
            to="/pharmacy/sales"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl"
          >
            <FileText className="w-3.5 h-3.5" /> {t('header.salesHistory')}
          </Link>
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 cursor-pointer"
            title={t('header.shortcuts')}
            aria-label={t('header.shortcuts')}
          >
            <Keyboard className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showHelp && (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 flex flex-wrap gap-x-5 gap-y-1">
          <span><kbd className="font-mono font-bold">F2</kbd> {t('help.search')}</span>
          <span><kbd className="font-mono font-bold">↑ ↓ Enter</kbd> {t('help.pick')}</span>
          <span><kbd className="font-mono font-bold">F4</kbd> {t('help.quantity')}</span>
          <span><kbd className="font-mono font-bold">F9</kbd> {t('help.complete')}</span>
          <span><kbd className="font-mono font-bold">Esc</kbd> {t('help.clear')}</span>
          <span>{t('help.scan')}</span>
        </div>
      )}
    </>
  );
};

export default PosHeader;
