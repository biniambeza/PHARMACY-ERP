import { useEffect, useRef, useState } from 'react';
import { Printer, X, Receipt, FileDown } from 'lucide-react';
import { getMyPharmacy } from '../../api/pharmacyApi';
import { formatMoney } from '../../utils/format';
import { exportPDF } from '../../utils/export';

// Receipt / tax invoice (#20, #22). Props: { isOpen, onClose, sale, pharmacy? }.
// When `pharmacy` is not passed, the active pharmacy (incl. settings) is loaded once and cached.
// Printing uses a hidden iframe with its own @page size (58mm / 80mm thermal or A4),
// so the rest of the app is never printed.

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

const METHOD_LABELS = { cash: 'Cash', card: 'Card', mobile_money: 'Mobile money', credit: 'Credit', store_credit: 'Store credit' };
const methodLabel = (m) => METHOD_LABELS[m] || String(m || '').replace(/_/g, ' ');

// Self-contained receipt styles: used for the on-screen preview and the print iframe.
const RECEIPT_CSS = `
.rcpt { font-family: 'Courier New', ui-monospace, monospace; color: #000; background: #fff; font-size: 12px; line-height: 1.35; margin: 0 auto; }
.rcpt.w58 { width: 48mm; font-size: 10px; }
.rcpt.w80 { width: 72mm; font-size: 11.5px; }
.rcpt.wA4 { width: 100%; max-width: 180mm; font-size: 12px; }
.rcpt .c { text-align: center; }
.rcpt .r { text-align: right; }
.rcpt .b { font-weight: 700; }
.rcpt .muted { color: #444; }
.rcpt .sm { font-size: 0.85em; }
.rcpt .lg { font-size: 1.25em; }
.rcpt .sep { border-top: 1px dashed #000; margin: 6px 0; }
.rcpt .row { display: flex; justify-content: space-between; gap: 6px; }
.rcpt .row > span:last-child { text-align: right; white-space: nowrap; }
.rcpt table { width: 100%; border-collapse: collapse; }
.rcpt th { text-align: left; font-weight: 700; border-bottom: 1px solid #000; padding: 2px 0; }
.rcpt td { padding: 2px 0; vertical-align: top; }
.rcpt .badge { display: inline-block; border: 2px solid #000; padding: 1px 6px; font-weight: 700; letter-spacing: 1px; margin: 4px 0; }
.rcpt .void { color: #b91c1c; border-color: #b91c1c; }
`;

const pageCss = (width) =>
  width === 'A4'
    ? '@page { size: A4; margin: 12mm; }'
    : `@page { size: ${width} auto; margin: 2mm; } html, body { width: ${width}; }`;

const ReceiptBody = ({ sale, pharmacy, width }) => {
  const settings = pharmacy?.settings || {};
  const currency = settings.currency;
  const money = (v) => formatMoney(Number(v) || 0, currency);
  const inclusive = Boolean(settings.tax?.inclusive);
  const narrow = width !== 'A4';
  const taxLines = sale.taxLines?.length
    ? sale.taxLines
    : Number(sale.tax) > 0
      ? [{ name: settings.tax?.name || 'Tax', rate: null, amount: sale.tax }]
      : [];
  const payments = sale.payments?.length
    ? sale.payments.filter((p) => p.status !== 'failed')
    : [{ method: sale.paymentMethod, amount: sale.amountPaid ?? sale.grandTotal }];
  const paid = sale.amountPaid ?? payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  // POS sales store the applied payment amounts plus `change` / `amountTendered` (Wave 3)
  const change =
    sale.change !== undefined && sale.change !== null
      ? Number(sale.change) || 0
      : Math.max(0, paid - (Number(sale.grandTotal) || 0) - (Number(sale.balanceDue) || 0));
  const staffName = sale.staffId?.name || sale.pharmacistId?.name;
  const customerName = sale.customerId?.name || sale.customer?.name || 'Walk-in Customer';
  const customerPhone = sale.customerId?.phone || sale.customer?.phone;
  const returnLabel = sale.returnStatus === 'full' ? 'RETURNED' : sale.returnStatus === 'partial' ? 'PARTIALLY RETURNED' : null;

  return (
    <div className={`rcpt w${width}`}>
      <div className="c">
        <div className="b lg">{pharmacy?.name || 'Pharmacy'}</div>
        {pharmacy?.address && <div className="sm">{pharmacy.address}</div>}
        {pharmacy?.phone && <div className="sm">Tel: {pharmacy.phone}</div>}
        {pharmacy?.licenseNo && <div className="sm">License: {pharmacy.licenseNo}</div>}
        {settings.tax?.registrationNo && <div className="sm">TIN/VAT No: {settings.tax.registrationNo}</div>}
        <div className="b" style={{ marginTop: 4 }}>{taxLines.length ? 'TAX INVOICE / RECEIPT' : 'RECEIPT'}</div>
        {sale.voided && <div className="badge void">VOIDED</div>}
        {!sale.voided && returnLabel && <div className="badge">{returnLabel}</div>}
      </div>

      <div className="sep" />
      <div className="row"><span>Invoice:</span><span className="b">{sale.invoiceNumber}</span></div>
      <div className="row"><span>Date:</span><span>{new Date(sale.createdAt).toLocaleString()}</span></div>
      {staffName && <div className="row"><span>Served by:</span><span>{staffName}</span></div>}
      <div className="row"><span>Customer:</span><span>{customerName}</span></div>
      {customerPhone && <div className="row"><span>Phone:</span><span>{customerPhone}</span></div>}
      {sale.prescription?.number && <div className="row"><span>Rx no:</span><span>{sale.prescription.number}</span></div>}
      {sale.voided && sale.voidReason && <div className="row"><span>Void reason:</span><span>{sale.voidReason}</span></div>}

      <div className="sep" />
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th className="r">Qty</th>
            {!narrow && <th className="r">Price</th>}
            <th className="r">Total</th>
          </tr>
        </thead>
        <tbody>
          {sale.items?.map((item, idx) => {
            const factor = Number(item.unitFactor) || 1;
            const qty = factor > 1 ? `${item.quantity / factor} ${item.unitName}` : item.quantity;
            return (
              <tr key={item._id || idx}>
                <td>
                  {item.name}
                  <div className="sm muted">
                    {narrow ? `${qty} x ${money(Number(item.unitPrice) * factor)}` : `Batch ${item.batchNo}`}
                  </div>
                </td>
                <td className="r">{qty}</td>
                {!narrow && <td className="r">{money(Number(item.unitPrice) * factor)}</td>}
                <td className="r">{money(item.subtotal)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="sep" />
      <div className="row"><span>Subtotal</span><span>{money(sale.subtotal)}</span></div>
      {Number(sale.discount) > 0 && <div className="row"><span>Discount</span><span>-{money(sale.discount)}</span></div>}
      {taxLines.map((t, i) => (
        <div className="row" key={i}>
          <span>
            {t.name}
            {t.rate !== null && t.rate !== undefined ? ` ${t.rate}%` : ''}
            {inclusive ? ' (incl.)' : ''}
          </span>
          <span>{inclusive ? '' : '+'}{money(t.amount)}</span>
        </div>
      ))}
      <div className="row b lg" style={{ marginTop: 4 }}><span>TOTAL</span><span>{money(sale.grandTotal)}</span></div>

      <div className="sep" />
      {payments.map((p, i) => (
        <div className="row" key={p._id || i}>
          <span>
            {methodLabel(p.method)}
            {p.reference ? ` (${p.reference})` : ''}
            {p.status === 'pending' ? ' - pending' : ''}
            {p.status === 'refunded' ? ' - refunded' : ''}
          </span>
          <span>{money(p.amount)}</span>
        </div>
      ))}
      {change > 0 && Number(sale.amountTendered) > 0 && (
        <div className="row"><span>Cash tendered</span><span>{money(sale.amountTendered)}</span></div>
      )}
      {change > 0 && <div className="row"><span>Change</span><span>{money(change)}</span></div>}
      {Number(sale.balanceDue) > 0 && (
        <>
          <div className="row b"><span>Balance due (credit)</span><span>{money(sale.balanceDue)}</span></div>
          {sale.customerId?.balance !== undefined && (
            <div className="row sm"><span>Account balance</span><span>{money(sale.customerId.balance)}</span></div>
          )}
        </>
      )}

      <div className="sep" />
      <div className="c sm">
        {settings.receiptFooter ? (
          settings.receiptFooter.split('\n').map((line, i) => <div key={i}>{line}</div>)
        ) : (
          <div>Thank you! Please keep this receipt.</div>
        )}
      </div>
    </div>
  );
};

const InvoiceReceiptModal = ({ isOpen, onClose, sale, pharmacy: pharmacyProp }) => {
  const [loadedPharmacy, setLoadedPharmacy] = useState(pharmacyCache);
  const [widthOverride, setWidthOverride] = useState(null);
  const receiptRef = useRef(null);
  const pharmacy = pharmacyProp || loadedPharmacy;

  useEffect(() => {
    if (!isOpen || pharmacyProp || loadedPharmacy) return undefined;
    let cancelled = false;
    loadPharmacy().then((p) => {
      if (!cancelled && p) setLoadedPharmacy(p);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, pharmacyProp, loadedPharmacy]);

  if (!isOpen || !sale) return null;

  const width = widthOverride || pharmacy?.settings?.receiptWidth || '80mm';

  const handlePrint = () => {
    const html = receiptRef.current?.innerHTML || '';
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${sale.invoiceNumber || 'Receipt'}</title>` +
        `<style>${RECEIPT_CSS} ${pageCss(width)} body { margin: 0; background: #fff; }</style></head>` +
        `<body>${html}</body></html>`
    );
    doc.close();
    const cleanup = () => setTimeout(() => iframe.remove(), 500);
    iframe.contentWindow.onafterprint = cleanup;
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(cleanup, 60000);
    }, 100);
  };

  const handlePdf = () => {
    const currency = pharmacy?.settings?.currency;
    const money = (v) => formatMoney(Number(v) || 0, currency);
    const summary = [
      ['Invoice', sale.invoiceNumber],
      ['Date', new Date(sale.createdAt).toLocaleString()],
      ['Customer', sale.customerId?.name || sale.customer?.name || 'Walk-in Customer'],
      ['Subtotal', money(sale.subtotal)],
      ...(Number(sale.discount) > 0 ? [['Discount', `-${money(sale.discount)}`]] : []),
      ...(sale.taxLines?.length
        ? sale.taxLines.map((t) => [`${t.name} ${t.rate}%`, money(t.amount)])
        : Number(sale.tax) > 0
          ? [['Tax', money(sale.tax)]]
          : []),
      ['Total', money(sale.grandTotal)],
      ...(Number(sale.balanceDue) > 0 ? [['Balance due', money(sale.balanceDue)]] : []),
      ...(sale.voided ? [['Status', 'VOIDED']] : sale.returnStatus && sale.returnStatus !== 'none' ? [['Status', `Returned (${sale.returnStatus})`]] : []),
    ];
    exportPDF({
      title: `Invoice ${sale.invoiceNumber}`,
      filename: `invoice-${sale.invoiceNumber}`,
      orientation: 'portrait',
      meta: {
        pharmacy: [pharmacy?.name, pharmacy?.address, pharmacy?.settings?.tax?.registrationNo ? `TIN/VAT: ${pharmacy.settings.tax.registrationNo}` : null]
          .filter(Boolean)
          .join(' | '),
        summary,
      },
      columns: [
        { key: 'name', header: 'Item' },
        { key: 'batchNo', header: 'Batch' },
        { key: 'quantity', header: 'Qty', align: 'right' },
        { key: 'unitPrice', header: 'Unit price', align: 'right', format: (v) => money(v) },
        { key: 'subtotal', header: 'Total', align: 'right', format: (v) => money(v) },
      ],
      rows: sale.items || [],
    });
  };

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
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Receipt & Tax Invoice</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Preview of the printed receipt</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-between mb-3 text-xs">
          <span className="text-slate-500 dark:text-slate-400">Paper</span>
          <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
            {['58mm', '80mm', 'A4'].map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWidthOverride(w)}
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
              <ReceiptBody sale={sale} pharmacy={pharmacy} width={width} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 pt-5 mt-4 border-t border-slate-200/80 dark:border-slate-800">
          <button
            type="button"
            onClick={handlePdf}
            className="px-4 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl shadow-2xs transition cursor-pointer flex items-center gap-1.5"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>PDF</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl shadow-2xs transition cursor-pointer flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Receipt</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer"
          >
            Done / Next Sale
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvoiceReceiptModal;
