// Client-side export helpers (#20). Owner: Insights agent.
//   exportCSV(rows, columns, filename)
//   exportPDF({ title, columns, rows, meta, filename, orientation })
//   downloadBlob(blob, filename)
// `columns`: [{ key, header, format?: (value, row) => string|number, align?: 'left'|'right'|'center' }]
// (`label` is accepted as an alias of `header`, and a column may be a plain key string.)
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

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

// meta: { subtitle, pharmacy, period, generatedBy, summary: [[label, value], ...] }
export const exportPDF = ({ title = 'Report', columns = [], rows = [], meta = {}, filename, orientation } = {}) => {
  const cols = normalizeColumns(columns, rows);
  const doc = new jsPDF({ orientation: orientation || (cols.length > 6 ? 'landscape' : 'portrait'), unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 40;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(String(title), 40, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100);
  const infoLines = [
    meta.pharmacy,
    meta.subtitle,
    meta.period ? `Period: ${meta.period}` : null,
    `Generated: ${new Date().toLocaleString()}${meta.generatedBy ? ` by ${meta.generatedBy}` : ''}`,
  ].filter(Boolean);
  infoLines.forEach((line) => {
    doc.text(String(line), 40, y);
    y += 12;
  });

  if (Array.isArray(meta.summary) && meta.summary.length) {
    autoTable(doc, {
      startY: y + 4,
      body: meta.summary.map(([k, v]) => [String(k), String(v ?? '')]),
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
    head: [cols.map((c) => String(c.header))],
    body: rows.map((row) => cols.map((c) => String(cellValue(c, row)))),
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: Object.fromEntries(cols.map((c, i) => [i, c.align ? { halign: c.align } : {}])),
    margin: { left: 40, right: 40 },
    didDrawPage: (data) => {
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Page ${data.pageNumber}`, pageWidth - 80, pageHeight - 20);
    },
  });

  if (!rows.length) {
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('No data for this selection.', 40, doc.lastAutoTable.finalY + 20);
  }

  doc.save(withExt(filename || title, 'pdf'));
};
