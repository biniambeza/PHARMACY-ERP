import { useTranslation } from 'react-i18next';
import { PAPER_WIDTHS } from '../../utils/printReceipt';

// Per-device receipt printer preferences (stored in localStorage by the parent).
// Props: { prefs, onChange(nextPrefs), pharmacyWidth }
const ReceiptPrinterSettings = ({ prefs, onChange, pharmacyWidth }) => {
  const { t } = useTranslation('receipt');
  const set = (patch) => onChange({ ...prefs, ...patch });
  const label = 'block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1';
  const input =
    'w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40';

  return (
    <div className="mb-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-3">
      <div>
        <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100">{t('printer.title')}</h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('printer.hint')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="rp-width" className={label}>{t('printer.paperWidth')}</label>
          <select id="rp-width" className={input} value={prefs.paperWidth} onChange={(e) => set({ paperWidth: e.target.value })}>
            <option value="">{t('printer.usePharmacyDefault', { width: pharmacyWidth || '80mm' })}</option>
            {PAPER_WIDTHS.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="rp-copies" className={label}>{t('printer.copies')}</label>
          <input
            id="rp-copies"
            type="number"
            min={1}
            max={5}
            className={input}
            value={prefs.copies}
            onChange={(e) => set({ copies: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })}
          />
        </div>
      </div>

      <div>
        <label htmlFor="rp-footer" className={label}>{t('printer.footer')}</label>
        <textarea
          id="rp-footer"
          rows={2}
          maxLength={300}
          className={input}
          placeholder={t('printer.footerPlaceholder')}
          value={prefs.footer}
          onChange={(e) => set({ footer: e.target.value })}
        />
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-slate-700 dark:text-slate-300">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="accent-emerald-600" checked={prefs.autoPrint} onChange={(e) => set({ autoPrint: e.target.checked })} />
          {t('printer.autoPrint')}
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="accent-emerald-600" checked={prefs.showLogo} onChange={(e) => set({ showLogo: e.target.checked })} />
          {t('printer.showLogo')}
        </label>
      </div>
    </div>
  );
};

export default ReceiptPrinterSettings;
