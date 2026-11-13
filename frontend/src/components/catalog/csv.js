// Small CSV helpers for the catalog module (import templates, ledger export).

const BOM = String.fromCharCode(0xfeff);
const BOM_RE = new RegExp(`^${BOM}`);

// Parses CSV text (RFC 4180 quotes, comma or semicolon delimiter, CRLF/LF).
// Returns { headers, rows } where rows are objects keyed by header and carry
// `_row` = the 1-based line number in the file (header = line 1).
export const parseCSV = (text) => {
  const src = String(text || '').replace(BOM_RE, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';

  const records = [];
  let field = '';
  let record = [];
  let inQuotes = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || record.length) {
    record.push(field);
    records.push(record);
  }

  if (!records.length) return { headers: [], rows: [] };
  const headers = records[0].map((h) => h.trim());
  const rows = [];
  records.slice(1).forEach((rec, idx) => {
    if (!rec.some((v) => String(v).trim() !== '')) return;
    const obj = { _row: idx + 2 };
    headers.forEach((h, c) => {
      if (h) obj[h] = (rec[c] ?? '').trim();
    });
    rows.push(obj);
  });
  return { headers: headers.filter(Boolean), rows };
};

const escapeCell = (v) => {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // Prevent CSV formula injection when opened in a spreadsheet
  if (/^[=+\-@\t\r]/.test(s) &&!/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// headers: string[]; rows: array of arrays
export const toCSV = (headers, rows) =>
  [headers, ...rows].map((r) => r.map(escapeCell).join(',')).join('\r\n');

export const downloadCSV = (filename, csvText) => {
  const blob = new Blob([BOM + csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
