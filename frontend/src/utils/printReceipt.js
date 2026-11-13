// Receipt printing helpers: per-device printer preferences (localStorage) and an
// isolated print through a hidden iframe, so the rest of the app is never printed.

export const PAPER_WIDTHS = ['58mm', '80mm', 'A4'];
const PREFS_KEY = 'receiptPrinterPrefs';

export const DEFAULT_PRINTER_PREFS = {
  paperWidth: '', // '' = use the pharmacy setting (settings.receiptWidth), else 58mm / 80mm / A4
  autoPrint: false, // print automatically after a POS sale
  copies: 1,
  footer: '', // extra per-device footer line(s), printed under the pharmacy footer
  showLogo: true,
};

const clampCopies = (n) => Math.min(5, Math.max(1, Math.round(Number(n) || 1)));

const sanitizePrefs = (raw = {}) => ({
  paperWidth: PAPER_WIDTHS.includes(raw.paperWidth) ? raw.paperWidth : '',
  autoPrint: Boolean(raw.autoPrint),
  copies: clampCopies(raw.copies),
  footer: typeof raw.footer === 'string' ? raw.footer.slice(0, 300) : '',
  showLogo: raw.showLogo === undefined ? true : Boolean(raw.showLogo),
});

export const loadPrinterPrefs = () => {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? sanitizePrefs(JSON.parse(raw)) : { ...DEFAULT_PRINTER_PREFS };
  } catch {
    return { ...DEFAULT_PRINTER_PREFS };
  }
};

export const savePrinterPrefs = (prefs) => {
  const clean = sanitizePrefs(prefs);
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(clean));
  } catch {
    // storage unavailable (private mode / blocked): keep in memory only
  }
  return clean;
};

// True when this device wants the receipt printed automatically after a sale.
export const shouldAutoPrint = () => loadPrinterPrefs().autoPrint;

// Width actually used: device preference, then the pharmacy setting, then 80mm.
export const resolvePaperWidth = (prefs, pharmacy) => {
  if (prefs?.paperWidth && PAPER_WIDTHS.includes(prefs.paperWidth)) return prefs.paperWidth;
  const fromPharmacy = pharmacy?.settings?.receiptWidth;
  return PAPER_WIDTHS.includes(fromPharmacy) ? fromPharmacy : '80mm';
};

// Self-contained receipt styles: used for the on-screen preview and the print iframe.
export const RECEIPT_CSS = `
.rcpt { font-family: 'Courier New', ui-monospace, Menlo, Consolas, monospace; color: #000; background: #fff; font-size: 12px; line-height: 1.3; margin: 0 auto; box-sizing: border-box; word-wrap: break-word; overflow-wrap: anywhere; }
.rcpt * { box-sizing: border-box; }
.rcpt.w58 { width: 48mm; font-size: 9.5px; }
.rcpt.w80 { width: 72mm; font-size: 11px; }
.rcpt.wA4 { width: 100%; max-width: 180mm; font-size: 12px; }
.rcpt .c { text-align: center; }
.rcpt .r { text-align: right; }
.rcpt .b { font-weight: 700; }
.rcpt .muted { color: #333; }
.rcpt .sm { font-size: 0.88em; }
.rcpt .lg { font-size: 1.2em; }
.rcpt .xl { font-size: 1.35em; }
.rcpt .sep { border-top: 1px dashed #000; margin: 5px 0; height: 0; }
.rcpt .sep2 { border-top: 2px solid #000; margin: 5px 0; height: 0; }
.rcpt .row { display: flex; justify-content: space-between; gap: 6px; }
.rcpt .row > span:first-child { min-width: 0; }
.rcpt .row > span:last-child { text-align: right; white-space: nowrap; }
.rcpt .item { margin: 2px 0; break-inside: avoid; }
.rcpt table { width: 100%; border-collapse: collapse; }
.rcpt th { text-align: left; font-weight: 700; border-bottom: 1px solid #000; padding: 2px 0; }
.rcpt td { padding: 2px 0; vertical-align: top; }
.rcpt .badge { display: inline-block; border: 2px solid #000; padding: 1px 6px; font-weight: 700; letter-spacing: 1px; margin: 4px 0; }
.rcpt .void { color: #000; text-decoration: line-through; }
.rcpt .logo { display: block; margin: 0 auto 3px; max-height: 40px; max-width: 70%; }
.rcpt .mono-logo { display: inline-block; border: 2px solid #000; border-radius: 50%; width: 30px; height: 30px; line-height: 26px; font-weight: 700; font-size: 15px; margin-bottom: 3px; }
.rcpt .bc { display: block; margin: 4px auto 0; max-width: 100%; height: auto; }
.rcpt-copy + .rcpt-copy { break-before: page; page-break-before: always; }
`;

export const pageCss = (width) =>
  width === 'A4'
    ? '@page { size: A4; margin: 12mm; }'
    : `@page { size: ${width} auto; margin: 0; } html, body { width: ${width}; } body { padding: 2mm 0; }`;

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Prints receipt markup in a hidden iframe sized for the paper.
 *   printReceiptHtml(html, { width: '80mm', copies: 1, title })
 * `html` is the inner HTML of the rendered receipt (a `.rcpt` element).
 */
export const printReceiptHtml = (html, { width = '80mm', copies = 1, title = 'Receipt' } = {}) => {
  if (typeof document === 'undefined' || !html) return false;
  const n = clampCopies(copies);
  const body = Array.from({ length: n }, () => `<div class="rcpt-copy">${html}</div>`).join('');
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('tabindex', '-1');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);
  const win = iframe.contentWindow;
  const doc = win.document;
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
      `<style>${RECEIPT_CSS} ${pageCss(width)} html, body { margin: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }</style></head>` +
      `<body>${body}</body></html>`
  );
  doc.close();
  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    setTimeout(() => iframe.remove(), 500);
  };
  win.onafterprint = cleanup;
  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } finally {
      setTimeout(cleanup, 60000);
    }
  }, 150);
  return true;
};
