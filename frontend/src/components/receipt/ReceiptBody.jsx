import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { useTranslation } from 'react-i18next';
import { formatMoney, formatDateTime } from '../../utils/format';
import { getReceiptText } from '../../api/receiptApi';
import ReceiptQr from './ReceiptQr';
import { buildReceiptQrText, usableFiscal } from './qrCode';

// Printable receipt (thermal 58mm / 80mm or A4). Styles come from RECEIPT_CSS in utils/printReceipt.js.
// Props: { sale, pharmacy, width, prefs, onFiscalPending?(pending) }
// onFiscalPending is called (after render) whenever the fiscal lookup starts or settles.

const METHOD_KEYS = ['cash', 'card', 'mobile_money', 'credit', 'store_credit', 'insurance', 'bank_transfer', 'cheque'];
const methodLabel = (t, m) =>
  METHOD_KEYS.includes(m) ? t(`methods.${m}`) : String(m || t('methods.other')).replace(/_/g, ' ');

// CODE128 barcode of the invoice number, drawn as inline SVG (so it is copied into the print iframe).
const InvoiceBarcode = ({ value, narrow }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, String(value), {
        format: 'CODE128',
        width: narrow ? 1.1 : 1.4,
        height: narrow ? 32 : 40,
        fontSize: narrow ? 10 : 12,
        margin: 0,
        displayValue: true,
        font: 'monospace',
      });
    } catch {
      // characters CODE128 can't encode: no barcode
    }
  }, [value, narrow]);
  return <svg ref={ref} className="bc" />;
};

const isServerId = (id) => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);

// Fiscal e-invoice identifiers for the QR code. Uses sale.fiscal when the caller already has
// it; otherwise, when e-invoicing is enabled and we are online, asks the receipt endpoint.
// Offline / not yet fiscalised: null (the QR then encodes TIN, invoice no, date and total).
// Returns { fiscal, pending }: `pending` is true while the fetch for this sale is still running
// (auto-print waits for it so the printed QR carries the fiscal number).
const useFiscal = (sale, pharmacy) => {
  const given = sale?.fiscal || null;
  const saleId = sale?._id;
  const shouldFetch =
    !given &&
    Boolean(pharmacy?.einvoice?.enabled) &&
    isServerId(saleId) &&
    !sale?.voided &&
    (typeof navigator === 'undefined' || navigator.onLine !== false);
  const [loaded, setLoaded] = useState({ saleId: null, fiscal: null });
  useEffect(() => {
    if (!shouldFetch) return undefined;
    let cancelled = false;
    getReceiptText(saleId)
      .then((res) => {
        if (!cancelled) setLoaded({ saleId, fiscal: res?.fiscal || null });
      })
      .catch(() => {
        // offline / no permission: keep the fallback QR
        if (!cancelled) setLoaded({ saleId, fiscal: null });
      });
    return () => {
      cancelled = true;
    };
  }, [shouldFetch, saleId]);
  if (given) return { fiscal: given, pending: false };
  const settled = loaded.saleId === saleId;
  return { fiscal: settled ? loaded.fiscal : null, pending: shouldFetch && !settled };
};

const Row = ({ label, value, className = '' }) => (
  <div className={`row ${className}`}>
    <span>{label}</span>
    <span>{value}</span>
  </div>
);

const ReceiptBody = ({ sale, pharmacy, width = '80mm', prefs = {}, onFiscalPending }) => {
  const { t } = useTranslation('receipt');
  const { fiscal: rawFiscal, pending: fiscalPending } = useFiscal(sale, pharmacy);
  const pendingCb = useRef(onFiscalPending);
  useEffect(() => {
    pendingCb.current = onFiscalPending;
  }, [onFiscalPending]);
  useEffect(() => {
    pendingCb.current?.(fiscalPending);
  }, [fiscalPending, sale?._id]);
  const settings = pharmacy?.settings || {};
  const currency = settings.currency;
  const money = (v) => formatMoney(Number(v) || 0, currency);
  const inclusive = Boolean(settings.tax?.inclusive);
  const narrow = width !== 'A4';
  const tin = pharmacy?.tin || settings.tax?.registrationNo;
  const logoUrl = pharmacy?.logoUrl || pharmacy?.logo;
  const fiscal = usableFiscal(rawFiscal);
  const qrText = buildReceiptQrText({ sale, pharmacy, fiscal });

  const taxLines = sale.taxLines?.length
    ? sale.taxLines
    : Number(sale.tax) > 0
      ? [{ name: settings.tax?.name || t('tax'), rate: null, amount: sale.tax }]
      : [];
  const payments = sale.payments?.length
    ? sale.payments.filter((p) => p.status !== 'failed')
    : [{ method: sale.paymentMethod, amount: sale.amountPaid ?? sale.grandTotal }];
  const paid = sale.amountPaid ?? payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  // POS sales store the applied payment amounts plus `change` / `amountTendered`
  const change =
    sale.change !== undefined && sale.change !== null
      ? Number(sale.change) || 0
      : Math.max(0, paid - (Number(sale.grandTotal) || 0) - (Number(sale.balanceDue) || 0));
  // Insurance sale: the insurer's share stays pending until the claim is paid.
  const insurance = sale.insurance?.schemeId || sale.insurance?.schemeName ? sale.insurance : null;
  const staffName = sale.staffId?.name || sale.pharmacistId?.name;
  const customerName = sale.customerId?.name || sale.customer?.name || t('walkIn');
  const customerPhone = sale.customerId?.phone || sale.customer?.phone;
  const returnLabel =
    sale.returnStatus === 'full' ? t('returned') : sale.returnStatus === 'partial' ? t('partiallyReturned') : null;
  const rawDate = sale.offlineCreatedAt || sale.createdAt;
  const dateText = rawDate ? formatDateTime(rawDate) : '';
  const footerLines = [
    ...(settings.receiptFooter ? String(settings.receiptFooter).split('\n') : [t('thankYou')]),
    ...(prefs.footer ? String(prefs.footer).split('\n') : []),
  ].filter((l) => l.trim() !== '');

  const qtyText = (item) => {
    const factor = Number(item.unitFactor) || 1;
    if (factor > 1) return `${Math.round((item.quantity / factor) * 1000) / 1000} ${item.unitName}`;
    return item.unitName && item.unitName !== 'unit' ? `${item.quantity} ${item.unitName}` : `${item.quantity}`;
  };
  const unitPrice = (item) => Number(item.unitPrice) * (Number(item.unitFactor) || 1);

  return (
    <div className={`rcpt w${String(width).replace('mm', '')}`}>
      <div className="c">
        {prefs.showLogo !== false &&
          (logoUrl ? (
            <img className="logo" src={logoUrl} alt="" />
          ) : (
            <div className="mono-logo">℞</div>
          ))}
        <div className="b xl">{pharmacy?.name || t('pharmacy')}</div>
        {pharmacy?.address && <div className="sm">{pharmacy.address}</div>}
        {pharmacy?.phone && <div className="sm">{t('tel', { value: pharmacy.phone })}</div>}
        {pharmacy?.licenseNo && <div className="sm">{t('license', { value: pharmacy.licenseNo })}</div>}
        {tin && <div className="sm">{t('tinVatNo', { value: tin })}</div>}
        <div className="b" style={{ marginTop: 4 }}>{taxLines.length ? t('taxInvoiceHeading') : t('receiptHeading')}</div>
        {sale.voided && <div className="badge">{t('voided')}</div>}
        {!sale.voided && returnLabel && <div className="badge">{returnLabel}</div>}
      </div>

      <div className="sep" />
      <Row label={t('invoiceLabel')} value={<span className="b">{sale.invoiceNumber}</span>} />
      <Row label={t('dateLabel')} value={dateText} />
      {staffName && <Row label={t('cashierLabel')} value={staffName} />}
      <Row label={t('customerLabel')} value={customerName} />
      {customerPhone && <Row label={t('phoneLabel')} value={customerPhone} />}
      {sale.prescription?.number && <Row label={t('rxNo')} value={sale.prescription.number} />}
      {sale.voided && sale.voidReason && <Row label={t('voidReason')} value={sale.voidReason} />}

      <div className="sep" />
      {narrow ? (
        // Thermal layout: name on its own line, "qty x price" and line total below
        <div>
          {sale.items?.map((item, idx) => (
            <div className="item" key={item._id || idx}>
              <div className={sale.voided ? 'void' : ''}>{item.name}</div>
              <div className="row">
                <span className="muted">
                  {qtyText(item)} x {money(unitPrice(item))}
                </span>
                <span>{money(item.subtotal)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t('item')}</th>
              <th className="r">{t('qty')}</th>
              <th className="r">{t('price')}</th>
              <th className="r">{t('total')}</th>
            </tr>
          </thead>
          <tbody>
            {sale.items?.map((item, idx) => (
              <tr key={item._id || idx}>
                <td>
                  {item.name}
                  {item.batchNo && <div className="sm muted">{t('batchNo', { batch: item.batchNo })}</div>}
                </td>
                <td className="r">{qtyText(item)}</td>
                <td className="r">{money(unitPrice(item))}</td>
                <td className="r">{money(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="sep" />
      <Row label={t('subtotal')} value={money(sale.subtotal)} />
      {Number(sale.discount) > 0 && <Row label={t('discount')} value={`-${money(sale.discount)}`} />}
      {taxLines.map((tl, i) => (
        <Row
          key={i}
          label={`${tl.name}${tl.rate !== null && tl.rate !== undefined ? ` ${tl.rate}%` : ''}${inclusive ? t('incl') : ''}`}
          value={`${inclusive ? '' : '+'}${money(tl.amount)}`}
        />
      ))}
      <div className="sep2" />
      <Row className="b lg" label={t('totalUpper')} value={money(sale.grandTotal)} />
      <div className="sep" />

      {payments.map((p, i) => {
        const ref = p.reference || p.memberNo;
        return (
          <Row
            key={p._id || i}
            label={
              <>
                {methodLabel(t, p.method)}
                {p.provider ? ` ${p.provider}` : ''}
                {ref ? ` (${ref})` : ''}
                {p.status === 'pending' ? t('pendingSuffix') : ''}
                {p.status === 'refunded' ? t('refundedSuffix') : ''}
              </>
            }
            value={money(p.amount)}
          />
        );
      })}
      {insurance && (
        <>
          <div className="sep" />
          <div className="b">{t('insuranceHeading')}</div>
          {insurance.schemeName && <Row label={t('insuranceScheme')} value={insurance.schemeName} />}
          {(insurance.memberNo || insurance.memberName) && (
            <Row
              label={t('insuranceMember')}
              value={[insurance.memberNo, insurance.memberName].filter(Boolean).join(' - ')}
            />
          )}
          <Row label={t('insurerPays')} value={money(insurance.insurerAmount)} />
          <Row className="b" label={t('patientPaid')} value={money(insurance.patientAmount)} />
          <div className="sep" />
        </>
      )}
      {Number(sale.amountTendered) > 0 && <Row label={t('cashTendered')} value={money(sale.amountTendered)} />}
      {change > 0 && <Row label={t('change')} value={money(change)} />}
      {Number(sale.balanceDue) > 0 && (
        <>
          <Row className="b" label={t('balanceDueCredit')} value={money(sale.balanceDue)} />
          {sale.customerId?.balance !== undefined && (
            <Row className="sm" label={t('accountBalance')} value={money(sale.customerId.balance)} />
          )}
        </>
      )}

      <div className="sep" />
      <div className="c sm">
        {footerLines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
      {sale.invoiceNumber && (
        <div className="c">
          <InvoiceBarcode value={sale.invoiceNumber} narrow={narrow} />
        </div>
      )}
      {qrText && (
        <ReceiptQr
          text={qrText}
          label={fiscal?.fiscalNumber ? t('qr.fiscalNo', { value: fiscal.fiscalNumber }) : fiscal ? t('qr.verify') : ''}
        />
      )}
    </div>
  );
};

export default ReceiptBody;
