import { useEffect, useRef, useState } from 'react';
import { FileBarChart2, Printer, Loader2 } from 'lucide-react';
import PosModal, { primaryBtn, secondaryBtn } from './PosModal';
import { getZReport } from '../../api/shiftApi';
import { formatMoney, formatDateTime } from '../../utils/format';
import { METHOD_LABELS, errMsg } from './posUtils';

const CSS = `
.zr { font-family: 'Courier New', ui-monospace, monospace; color: #000; background: #fff; font-size: 12px; line-height: 1.4; max-width: 80mm; margin: 0 auto; }
.zr h2 { text-align: center; font-size: 15px; margin: 0 0 4px; }
.zr .c { text-align: center; }
.zr .row { display: flex; justify-content: space-between; gap: 8px; }
.zr .b { font-weight: 700; }
.zr .sep { border-top: 1px dashed #000; margin: 6px 0; }
.zr .neg { color: #b91c1c; }
`;

const Row = ({ label, value, bold, neg }) => (
  <div className={`row${bold ? ' b' : ''}${neg ? ' neg' : ''}`}>
    <span>{label}</span>
    <span>{value}</span>
  </div>
);

const ZReportBody = ({ z, pharmacyName }) => {
  const m = (v) => formatMoney(Number(v) || 0);
  const pays = z.paymentsByMethod || {};
  return (
    <div className="zr">
      <h2>{z.status === 'open' ? 'X-REPORT (shift open)' : 'Z-REPORT'}</h2>
      {pharmacyName && <div className="c">{pharmacyName}</div>}
      <div className="sep" />
      <Row label="Shift" value={z.shiftNumber} bold />
      <Row label="Cashier" value={z.cashier?.name || '-'} />
      <Row label="Opened" value={formatDateTime(z.openedAt)} />
      <Row label="Closed" value={z.closedAt ? formatDateTime(z.closedAt) : '-'} />
      {z.closedBy?.name && <Row label="Closed by" value={z.closedBy.name} />}
      <div className="sep" />
      <Row label={`Sales (${z.sales?.count || 0})`} value={m(z.sales?.subtotal)} />
      <Row label="Discounts" value={`-${m(z.sales?.discount)}`} />
      <Row label="Tax" value={m(z.sales?.tax)} />
      <Row label="Net sales" value={m(z.sales?.total)} bold />
      <Row label={`Voids (${z.voids?.count || 0})`} value={m(z.voids?.total)} />
      <Row label={`Returns (${z.returns?.count || 0})`} value={m(z.returns?.refundTotal)} />
      <div className="sep" />
      <div className="b">Payments</div>
      {Object.keys(METHOD_LABELS).map((k) => (
        <Row key={k} label={METHOD_LABELS[k]} value={m(pays[k])} />
      ))}
      {z.customerPayments?.count > 0 && (
        <>
          <div className="b" style={{ marginTop: 4 }}>Customer payments ({z.customerPayments.count})</div>
          {Object.entries(z.customerPayments.byMethod || {}).map(([k, v]) => (
            <Row key={k} label={METHOD_LABELS[k] || k} value={m(v)} />
          ))}
        </>
      )}
      <div className="sep" />
      <div className="b">Cash drawer</div>
      <Row label="Opening float" value={m(z.openingFloat)} />
      <Row label="+ Cash sales" value={m(z.expected?.cashSales)} />
      <Row label="+ Customer payments" value={m(z.expected?.customerPaymentsCash)} />
      <Row label="- Cash refunds" value={m(z.expected?.refundsCash)} />
      <Row label="Expected cash" value={m(z.expected?.cash)} bold />
      {z.counted && (
        <>
          <div className="sep" />
          <div className="b">Counted / variance</div>
          {['cash', 'card', 'mobile_money'].map((k) => (
            <Row
              key={k}
              label={`${METHOD_LABELS[k]}: ${m(z.counted[k])} (exp. ${m(z.expected?.[k])})`}
              value={`${Number(z.variance?.[k]) > 0 ? '+' : ''}${m(z.variance?.[k])}`}
              neg={Number(z.variance?.[k]) < 0}
            />
          ))}
        </>
      )}
      {z.topItems?.length > 0 && (
        <>
          <div className="sep" />
          <div className="b">Top items</div>
          {z.topItems.slice(0, 5).map((i) => (
            <Row key={i.medicineId} label={`${i.name} ×${i.quantity}`} value={m(i.total)} />
          ))}
        </>
      )}
      <div className="sep" />
      <div className="c">Generated {formatDateTime(z.generatedAt)}</div>
    </div>
  );
};

// Printable Z-report of a shift. Props: { shiftId, open, onClose, initial?, pharmacyName? }
const ZReportModal = ({ shiftId, open, onClose, initial, pharmacyName }) => {
  const [z, setZ] = useState(initial || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bodyRef = useRef(null);

  useEffect(() => {
    if (!open || !shiftId || initial) return undefined;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const data = await getZReport(shiftId);
        if (!cancelled) setZ(data.zReport);
      } catch (err) {
        if (!cancelled) setError(errMsg(err, 'Could not load the report'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, shiftId, initial]);

  const report = initial || z;

  const print = () => {
    if (!bodyRef.current) return;
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    doc.open();
    doc.write(
      `<!doctype html><html><head><title>Z-report ${report?.shiftNumber || ''}</title><style>${CSS} @page { size: 80mm auto; margin: 3mm; }</style></head><body>${bodyRef.current.innerHTML}</body></html>`
    );
    doc.close();
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => iframe.remove(), 1000);
    }, 100);
  };

  return (
    <PosModal
      open={open}
      title="Shift report"
      icon={FileBarChart2}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={secondaryBtn} onClick={onClose}>Close</button>
          <button type="button" className={primaryBtn} onClick={print} disabled={!report}>
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </>
      }
    >
      <style>{CSS}</style>
      {loading && (
        <div className="py-8 flex justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {report && !loading && (
        <div ref={bodyRef} className="bg-white rounded-xl p-3">
          <ZReportBody z={report} pharmacyName={pharmacyName} />
        </div>
      )}
    </PosModal>
  );
};

export default ZReportModal;
