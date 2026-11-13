import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Printer, X, Receipt, FileDown, Settings2 } from 'lucide-react';
import { getMyPharmacy } from '../../api/pharmacyApi';
import { formatMoney } from '../../utils/format';
import { exportPDF } from '../../utils/export';
import {
  RECEIPT_CSS,
  PAPER_WIDTHS,
  loadPrinterPrefs,
  savePrinterPrefs,
  resolvePaperWidth,
  printReceiptHtml,
} from '../../utils/printReceipt';
import ReceiptBody from '../../components/receipt/ReceiptBody';
import ReceiptPrinterSettings from '../../components/receipt/ReceiptPrinterSettings';
import SendReceiptPanel from '../../components/receipt/SendReceiptPanel';

// Receipt / tax invoice (#20, #22). Props: { isOpen, onClose, sale, pharmacy?, autoPrint? }.
// When `pharmacy` is not passed, the active pharmacy (incl. settings) is loaded once and cached.
// Printing uses a hidden iframe with its own @page size (58mm / 80mm thermal roll or A4),
// so the rest of the app is never printed. Printer preferences are per device (localStorage).
// `autoPrint`: when true and this device has "auto-print after sale" on, the receipt is
// printed once as soon as it opens (POS passes it after checkout).

let pharmacyCache = null;
let pharmacyPromise = null;
const loadPharmacy = () => {
  if (pharmacyCache) return Promise.resolve(pharmacyCache);
  if (!pharmacyPromise) {
    pharmacyPromise = getMyPharmacy()
      .then((res) => {
        pharmacyCache = res.pharmacy;
        return pharmacyCache;
      })
      .catch(() => null)
      .finally(() => {
        pharmacyPromise = null;
      });
  }
  return pharmacyPromise;
};

// Call after the pharmacy settings change so the next receipt reloads them.
// eslint-disable-next-line react-refresh/only-export-components
export const invalidateReceiptPharmacy = () => {
  pharmacyCache = null;
};

const isServerId = (id) => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);

const InvoiceReceiptModal = ({ isOpen, onClose, sale, pharmacy: pharmacyProp, autoPrint = false }) => {
  const { t } = useTranslation(['receipt', 'common']);
  const [loadedPharmacy, setLoadedPharmacy] = useState(pharmacyCache);
  const [loadDone, setLoadDone] = useState(Boolean(pharmacyCache));
  const [prefs, setPrefs] = useState(loadPrinterPrefs);
  const [showSettings, setShowSettings] = useState(false);
  const receiptRef = useRef(null);
  const autoPrintedFor = useRef(null);
  const pharmacy = pharmacyProp || loadedPharmacy;
  const width = resolvePaperWidth(prefs, pharmacy);

  useEffect(() => {
    if (!isOpen || pharmacyProp || loadedPharmacy) return undefined;
    let cancelled = false;
    loadPharmacy().then((p) => {
      if (cancelled) return;
      if (p) setLoadedPharmacy(p);
      setLoadDone(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, pharmacyProp, loadedPharmacy]);

  const updatePrefs = (next) => setPrefs(savePrinterPrefs(next));

  const handlePrint = () => {
    printReceiptHtml(receiptRef.current?.innerHTML || '', {
      width,
      copies: prefs.copies,
      title: sale?.invoiceNumber || t('receipt'),
    });
  };

  // Auto-print once per sale after checkout, once the pharmacy header is known.
  const saleKey = sale?._id || sale?.offlineId || sale?.invoiceNumber;
  const ready = Boolean(pharmacyProp || loadedPharmacy || loadDone);
  useEffect(() => {
    if (!isOpen || !autoPrint || !prefs.autoPrint || !saleKey || !ready) return;
    if (autoPrintedFor.current === saleKey) return;
    autoPrintedFor.current = saleKey;
    printReceiptHtml(receiptRef.current?.innerHTML || '', {
      width,
      copies: prefs.copies,
      title: sale?.invoiceNumber || 'Receipt',
    });
  }, [isOpen, autoPrint, prefs.autoPrint, prefs.copies, saleKey, ready, width, sale?.invoiceNumber]);

  if (!isOpen || !sale) return null;

  const handlePdf = () => {
    const currency = pharmacy?.settings?.currency;
    const money = (v) => formatMoney(Number(v) || 0, currency);
    const tin = pharmacy?.tin || pharmacy?.settings?.tax?.registrationNo;
    const summary = [
      [t('invoice'), sale.invoiceNumber],
      [t('date'), new Date(sale.createdAt).toLocaleString()],
      [t('customer'), sale.customerId?.name || sale.customer?.name || t('walkIn')],
      [t('subtotal'), money(sale.subtotal)],
      ...(Number(sale.discount) > 0 ? [[t('discount'), `-${money(sale.discount)}`]] : []),
      ...(sale.taxLines?.length
        ? sale.taxLines.map((tl) => [`${tl.name} ${tl.rate}%`, money(tl.amount)])
        : Number(sale.tax) > 0
          ? [[t('tax'), money(sale.tax)]]
          : []),
      [t('total'), money(sale.grandTotal)],
      ...(Number(sale.balanceDue) > 0 ? [[t('balanceDue'), money(sale.balanceDue)]] : []),
      ...(sale.voided ? [[t('status'), t('voided')]] : sale.returnStatus && sale.returnStatus !== 'none' ? [[t('status'), t('returnedStatus', { status: sale.returnStatus })]] : []),
    ];
    exportPDF({
      title: t('pdfTitle', { number: sale.invoiceNumber }),
      filename: `invoice-${sale.invoiceNumber}`,
      orientation: 'portrait',
      meta: {
        pharmacy: [pharmacy?.name, pharmacy?.address, tin ? t('tinVat', { value: tin }) : null]
          .filter(Boolean)
          .join(' | '),
        summary,
      },
      columns: [
        { key: 'name', header: t('item') },
        { key: 'batchNo', header: t('batch') },
        { key: 'quantity', header: t('qty'), align: 'right' },
        { key: 'unitPrice', header: t('unitPrice'), align: 'right', format: (v) => money(v) },
        { key: 'subtotal', header: t('total'), align: 'right', format: (v) => money(v) },
      ],
      rows: sale.items || [],
    });
  };

  const secondaryBtn =
    'px-4 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl shadow-2xs transition cursor-pointer flex items-center gap-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs">
      <style>{RECEIPT_CSS}</style>
      <div className="bg-white dark:bg-[#161c26] border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-200/80 dark:border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">{t('title')}</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              aria-label={t('printer.title')}
              aria-expanded={showSettings}
              title={t('printer.title')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                showSettings
                  ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Settings2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common:buttons.close')}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {showSettings && (
          <ReceiptPrinterSettings prefs={prefs} onChange={updatePrefs} pharmacyWidth={pharmacy?.settings?.receiptWidth} />
        )}

        <div className="flex items-center justify-between mb-3 text-xs">
          <span className="text-slate-500 dark:text-slate-400">{t('paper')}</span>
          <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
            {PAPER_WIDTHS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => updatePrefs({ ...prefs, paperWidth: w })}
                className={`px-3 py-1 rounded-lg font-mono text-[11px] cursor-pointer transition ${
                  width === w
                    ? 'bg-white dark:bg-[#161c26] text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        {/* Paper preview (always black on white, like the printout) */}
        <div className="bg-slate-100 dark:bg-slate-900/80 rounded-xl p-4 overflow-x-auto">
          <div className="bg-white shadow-sm mx-auto p-3" style={{ width: width === 'A4' ? '100%' : `calc(${width} + 24px)` }}>
            <div ref={receiptRef}>
              <ReceiptBody sale={sale} pharmacy={pharmacy} width={width} prefs={prefs} />
            </div>
          </div>
        </div>

        {isServerId(String(sale._id || '')) && <SendReceiptPanel key={sale._id} sale={sale} />}

        <div className="flex flex-wrap items-center justify-end gap-3 pt-5 mt-4 border-t border-slate-200/80 dark:border-slate-800">
          <button type="button" onClick={handlePdf} className={secondaryBtn}>
            <FileDown className="w-3.5 h-3.5" />
            <span>{t('pdf')}</span>
          </button>
          <button type="button" onClick={handlePrint} className={secondaryBtn}>
            <Printer className="w-3.5 h-3.5" />
            <span>{prefs.copies > 1 ? t('printCopies', { count: prefs.copies }) : t('printReceipt')}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer"
          >
            {t('doneNextSale')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvoiceReceiptModal;
