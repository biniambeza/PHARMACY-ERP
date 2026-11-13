import { useMemo } from 'react';
import { qrSvgPath } from './qrCode';

// Receipt QR code as inline SVG (copied as-is into the print iframe; no network needed).
// Size comes from RECEIPT_CSS (.rcpt .qr): ~25mm on 80mm paper, smaller on 58mm.
const ReceiptQr = ({ text, label }) => {
  const qr = useMemo(() => qrSvgPath(text), [text]);
  if (!qr) return null;
  return (
    <div className="c">
      <svg
        className="qr"
        viewBox={`0 0 ${qr.size} ${qr.size}`}
        xmlns="http://www.w3.org/2000/svg"
        shapeRendering="crispEdges"
        role="img"
        aria-label={label || 'QR code'}
      >
        <rect width={qr.size} height={qr.size} fill="#fff" />
        <path d={qr.path} fill="#000" />
      </svg>
      {label && <div className="sm qr-label">{label}</div>}
    </div>
  );
};

export default ReceiptQr;
