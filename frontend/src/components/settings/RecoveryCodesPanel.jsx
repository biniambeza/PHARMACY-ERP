import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, Download, AlertTriangle } from 'lucide-react';

/** Shows freshly generated recovery codes once, with copy / download. */
const RecoveryCodesPanel = ({ codes, email, onDone }) => {
  const { t } = useTranslation('security');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const text = [
    t('recovery.fileHeader', { email: email || '' }),
    t('recovery.fileNote'),
    '',
    ...codes,
    '',
    new Date().toISOString(),
  ].join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
      setSaved(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable: the codes stay selectable
    }
  };

  const download = () => {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pharmacy-erp-recovery-codes.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setSaved(true);
  };

  const btn =
    'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800';

  return (
    <div className="space-y-3">
      <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 text-xs flex gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>{t('recovery.warning')}</span>
      </div>
      <ul className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 font-mono text-sm text-slate-900 dark:text-white select-all">
        {codes.map((c) => (
          <li key={c} className="text-center">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className={btn}>
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? t('recovery.copied') : t('recovery.copy')}
        </button>
        <button type="button" onClick={download} className={btn}>
          <Download className="w-3.5 h-3.5" />
          {t('recovery.download')}
        </button>
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
        {t('recovery.savedConfirm')}
      </label>
      <button
        type="button"
        disabled={!saved}
        onClick={onDone}
        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition cursor-pointer"
      >
        {t('recovery.done')}
      </button>
    </div>
  );
};

export default RecoveryCodesPanel;
