// Client-side export helpers (#20). Owner: Insights agent.
//   exportCSV(rows, columns, filename)
//   exportPDF({ title, columns, rows, meta, filename, orientation })
//   downloadBlob(blob, filename)
// `columns`: [{ key, header, format?: (value, row) => string|number, align?: 'left'|'right'|'center' }]
// (`label` is accepted as an alias of `header`, and a column may be a plain key string.)
// jsPDF + autotable (~800 kB, chunk vendor-pdf) are loaded on demand by exportPDF only, so
// pages that import this file (CSV export, downloadBlob) do not pull them into the initial load.
//
// Amharic (Ethiopic script): jsPDF's built-in fonts have no Ethiopic glyphs and jsPDF needs a
// complete TTF (the bundled @fontsource files are woff/woff2 unicode-range subsets, so a mixed
// Latin + Amharic cell could never render from one embedded font). When any text of the export
// contains Ethiopic characters, exportPDF instead renders a print-friendly HTML table in a
// hidden iframe and opens the browser's print dialog ("Save as PDF"). The browser renders it
// with the app's own bundled fonts (Noto Sans Ethiopic is only downloaded when Ethiopic text is
// shown, via unicode-range), it works offline (fonts are cached by the service worker) and it
// handles mixed scripts. Latin-only exports (English, Afaan Oromoo) keep the direct jsPDF download.
import i18n from '../i18n';
import { formatDateTime } from './format';

const pdfLabel = (key, options) => i18n.t(`common:pdfExport.${key}`, options);

const loadPdfLib = () =>
  Promise.all([import('jspdf'), import('jspdf-autotable')]).then(([pdf, table]) => ({
    jsPDF: pdf.jsPDF,
    autoTable: table.autoTable,
  }));

const normalizeColumns = (columns, rows) => {
  const cols = columns && columns.length ? columns : Object.keys(rows?.[0] || {});
  return cols.map((c) => (typeof c === 'string' ? { key: c, header: c } : { ...c, header: c.header ?? c.label ?? c.key }));
};

const cellValue = (col, row) => {
  const raw = typeof col.key === 'function' ? col.key(row) : row?.[col.key];
  const v = col.format ? col.format(raw, row) : raw;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return v;
};

const stamp = () => new Date().toISOString().slice(0, 10);

const withExt = (name, ext) => {
  const base = (name || 'export').replace(/[\\/:*?"<>|]+/g, '-');
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}-${stamp()}.${ext}`;
};

export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const csvEscape = (value) => {
  let s = String(value);
  // Neutralize spreadsheet formula injection (keep plain negative numbers)
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const exportCSV = (rows = [], columns = [], filename = 'export') => {
  const cols = normalizeColumns(columns, rows);
  const lines = [cols.map((c) => csvEscape(c.header)).join(',')];
  rows.forEach((row) => lines.push(cols.map((c) => csvEscape(cellValue(c, row))).join(',')));
  // BOM so Excel opens UTF-8 (e.g. Amharic) correctly
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, withExt(filename, 'csv'));
};

// Ethiopic, Ethiopic Supplement, Ethiopic Extended, Ethiopic Extended-A.
const ETHIOPIC_RE = /[ሀ-᎟ⶀ-⷟꬀-꬯]/;
export const hasEthiopic = (value) => ETHIOPIC_RE.test(String(value ?? ''));

// Everything both renderers need, as plain strings (labels translated to the active language).
const preparePdf = ({ title, columns = [], rows = [], meta = {}, filename, orientation } = {}) => {
  const cols = normalizeColumns(columns, rows);
  const docTitle = String(title ?? pdfLabel('report'));
  const date = formatDateTime(new Date());
  const infoLines = [
    meta.pharmacy,
    meta.subtitle,
    meta.period ? pdfLabel('period', { value: meta.period }) : null,
    meta.generatedBy ? pdfLabel('generatedBy', { date, name: meta.generatedBy }) : pdfLabel('generated', { date }),
  ]
    .filter(Boolean)
    .map(String);
  const summary = Array.isArray(meta.summary) ? meta.summary.map(([k, v]) => [String(k), String(v ?? '')]) : [];
  const head = cols.map((c) => String(c.header));
  const body = rows.map((row) => cols.map((c) => String(cellValue(c, row))));
  const noData = body.length ? null : pdfLabel('noData');
  const resolvedOrientation = orientation || (cols.length > 6 ? 'landscape' : 'portrait');
  return {
    title: docTitle,
    cols,
    infoLines,
    summary,
    head,
    body,
    noData,
    orientation: resolvedOrientation,
    filename: withExt(filename || docTitle, 'pdf'),
    strings: [docTitle, ...infoLines, ...summary.flat(), ...head, ...body.flat(), noData].filter(Boolean),
  };
};

// meta: { subtitle, pharmacy, period, generatedBy, summary: [[label, value], ...] }
// Async: resolves once the PDF is saved (or, for Ethiopic text, the print dialog was opened).
// Never rejects (callers fire and forget); a failure to load the PDF library (e.g. offline
// before the chunk was cached) is logged and resolves false.
export const exportPDF = async (options = {}) => {
  let prepared;
  try {
    prepared = preparePdf(options);
  } catch (err) {
    console.error('PDF export failed', err);
    return false;
  }
  if (prepared.strings.some(hasEthiopic)) {
    try {
      await printHTML(prepared);
      return true;
    } catch (err) {
      console.error('PDF export failed (print view)', err);
      return false;
    }
  }
  let lib;
  try {
    lib = await loadPdfLib();
  } catch (err) {
    console.error('PDF export failed: could not load the PDF library', err);
    return false;
  }
  try {
    buildPDF(lib, prepared);
    return true;
  } catch (err) {
    console.error('PDF export failed', err);
    return false;
  }
};

const buildPDF = ({ jsPDF, autoTable }, { title, cols, infoLines, summary, head, body, noData, orientation, filename }) => {
  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 40;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, 40, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100);
  infoLines.forEach((line) => {
    doc.text(line, 40, y);
    y += 12;
  });

  if (summary.length) {
    autoTable(doc, {
      startY: y + 4,
      body: summary,
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 160 } },
      margin: { left: 40, right: 40 },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  doc.setTextColor(0);
  autoTable(doc, {
    startY: y + 4,
    head: [head],
    body,
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: Object.fromEntries(cols.map((c, i) => [i, c.align ? { halign: c.align } : {}])),
    margin: { left: 40, right: 40 },
    didDrawPage: (data) => {
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(pdfLabel('page', { n: data.pageNumber }), pageWidth - 80, pageHeight - 20);
    },
  });

  if (noData) {
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(noData, 40, doc.lastAutoTable.finalY + 20);
  }

  doc.save(filename);
};

// ---- Print view (Ethiopic text) ----

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);

const printCss = (orientation) => `
  @page { size: A4 ${orientation}; margin: 14mm; }
  html, body { background: #fff; color: #0f172a; margin: 0; }
  body.pdf-export, body.pdf-export * { font-family: 'Inter', 'Noto Sans Ethiopic', system-ui, sans-serif; }
  body.pdf-export { font-size: 10px; }
  .pdf-export h1 { font-size: 18px; font-weight: 700; margin: 0 0 6px; }
  .pdf-export .info { color: #64748b; font-size: 9px; margin: 0 0 2px; }
  .pdf-export table { border-collapse: collapse; width: 100%; margin-top: 10px; }
  .pdf-export th, .pdf-export td { padding: 4px 5px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  .pdf-export table.data th { background: #10b981; color: #fff; font-weight: 700; }
  .pdf-export table.data td { border-bottom: 1px solid #e2e8f0; }
  .pdf-export table.data tbody tr:nth-child(even) td { background: #f5f7fa; }
  .pdf-export table.data th, .pdf-export table.data td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .pdf-export table.data thead { display: table-header-group; }
  .pdf-export table.data tr { break-inside: avoid; }
  .pdf-export table.summary { width: auto; margin-top: 8px; }
  .pdf-export table.summary td { padding: 1px 12px 1px 0; }
  .pdf-export table.summary td:first-child { font-weight: 700; }
  .pdf-export .right { text-align: right; }
  .pdf-export .center { text-align: center; }
  .pdf-export .empty { color: #64748b; font-size: 11px; margin-top: 12px; }
`;

const buildPrintBody = ({ title, cols, infoLines, summary, head, body, noData }) => {
  const cls = (i) => (cols[i]?.align === 'right' || cols[i]?.align === 'center' ? ` class="${cols[i].align}"` : '');
  const summaryHtml = summary.length
    ? `<table class="summary"><tbody>${summary
        .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
        .join('')}</tbody></table>`
    : '';
  return [
    `<h1>${escapeHtml(title)}</h1>`,
    infoLines.map((l) => `<p class="info">${escapeHtml(l)}</p>`).join(''),
    summaryHtml,
    `<table class="data"><thead><tr>${head.map((h, i) => `<th${cls(i)}>${escapeHtml(h)}</th>`).join('')}</tr></thead>`,
    `<tbody>${body.map((r) => `<tr>${r.map((v, i) => `<td${cls(i)}>${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`,
    noData ? `<p class="empty">${escapeHtml(noData)}</p>` : '',
  ].join('\n');
};

const settleWithin = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);

// Renders the export in a hidden same-origin iframe (no popup, so no popup blocker after the
// async click handler) together with the app's stylesheets (and so its bundled @font-face
// rules), waits for the fonts and opens the print dialog. The document title is the suggested
// PDF file name.
const printHTML = async (prepared) => {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(iframe);
  try {
    const win = iframe.contentWindow;
    const doc = win.document;
    const appStyles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((el) => el.outerHTML).join('\n');
    const lang = escapeHtml(i18n.resolvedLanguage || i18n.language || 'en');
    const docTitle = escapeHtml(prepared.filename.replace(/\.pdf$/i, ''));
    const loaded = new Promise((resolve) => iframe.addEventListener('load', resolve, { once: true }));
    doc.open();
    doc.write(
      `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${docTitle}</title>${appStyles}` +
        `<style>${printCss(prepared.orientation)}</style></head><body class="pdf-export">${buildPrintBody(prepared)}</body></html>`
    );
    doc.close();
    await settleWithin(loaded, 3000);
    if (doc.fonts) {
      void doc.body.offsetHeight; // force layout so the needed font faces start loading
      await settleWithin(
        Promise.all([
          doc.fonts.load('400 12px "Noto Sans Ethiopic"', 'ሀ'),
          doc.fonts.load('700 12px "Noto Sans Ethiopic"', 'ሀ'),
        ]).catch(() => {}),
        5000
      );
      await settleWithin(doc.fonts.ready, 5000);
    }
    win.addEventListener('afterprint', () => setTimeout(() => iframe.remove(), 500), { once: true });
    win.focus();
    win.print();
    // Cleanup for browsers without afterprint or where print() does not block.
    setTimeout(() => iframe.remove(), 60000);
  } catch (err) {
    iframe.remove();
    throw err;
  }
};
