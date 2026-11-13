// QR code content + rendering for printed receipts. Fully client-side (works offline / PWA).
import QRCode from 'qrcode';

const pad = (n) => String(n).padStart(2, '0');
const localStamp = (raw) => {
  const d = raw ? new Date(raw) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Fiscal identifiers usable for the QR (accepted / submitted documents only).
export const usableFiscal = (fiscal) => {
  if (!fiscal || ['rejected', 'failed'].includes(fiscal.status)) return null;
  return fiscal.qrPayload || fiscal.fiscalNumber || fiscal.irn ? fiscal : null;
};

/**
 * Text encoded in the receipt QR code.
 * With a fiscal invoice: the authority's signed QR content (verification URL / payload), else
 * its fiscal number / IRN. Otherwise a compact self-describing string:
 *   TIN:<tin>|INV:<invoice no>|DT:<yyyy-mm-ddThh:mm>|TOT:<grand total>|CUR:<currency>
 */
export const buildReceiptQrText = ({ sale, pharmacy, fiscal }) => {
  const f = usableFiscal(fiscal);
  if (f) {
    if (f.qrPayload) return String(f.qrPayload);
    return [f.fiscalNumber && `FN:${f.fiscalNumber}`, f.irn && `IRN:${f.irn}`, sale?.invoiceNumber && `INV:${sale.invoiceNumber}`]
      .filter(Boolean)
      .join('|');
  }
  if (!sale?.invoiceNumber) return '';
  const settings = pharmacy?.settings || {};
  const tin = pharmacy?.tin || settings.tax?.registrationNo;
  const total = (Math.round((Number(sale.grandTotal) || 0) * 100) / 100).toFixed(2);
  return [
    tin && `TIN:${tin}`,
    `INV:${sale.invoiceNumber}`,
    `DT:${localStamp(sale.offlineCreatedAt || sale.createdAt)}`,
    `TOT:${total}`,
    settings.currency && `CUR:${settings.currency}`,
  ]
    .filter(Boolean)
    .join('|');
};

/**
 * Builds the QR synchronously (so it is already in the DOM when the receipt is printed)
 * and returns { size, path } for an SVG with viewBox "0 0 size size", or null.
 */
export const qrSvgPath = (text, { margin = 2 } = {}) => {
  if (!text) return null;
  try {
    // Long (signed) payloads use level L to keep the modules large enough for thermal print.
    const qr = QRCode.create(text, { errorCorrectionLevel: text.length > 150 ? 'L' : 'M' });
    const { size, data } = qr.modules;
    let path = '';
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (data[y * size + x]) path += `M${x + margin} ${y + margin}h1v1h-1z`;
      }
    }
    return { size: size + margin * 2, path };
  } catch {
    return null; // too long to encode
  }
};
