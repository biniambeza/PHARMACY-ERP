import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { Upload, FileDown, FileSpreadsheet, CheckCircle, ShieldCheck, AlertCircle } from 'lucide-react';
import { parseImportFile, importRows } from '../../api/importApi';
import { parseCSV, toCSV, downloadCSV } from '../../components/catalog/csv';
import { cardCls, primaryBtn, secondaryBtn, theadCls, errorBox } from '../../components/catalog/styles';

const CHUNK = 500;
const MAX_XLSX_BYTES = 700 * 1024; // base64 grows ~33%; server JSON limit is 1mb

const KINDS = {
  medicines: {
    label: 'Medicines',
    description: 'Create catalog items. Medicines whose name already exists are skipped.',
    headers: ['Name', 'Generic Name', 'Category', 'Dosage Form', 'Strength', 'Price', 'Cost Price', 'Min Stock Level', 'Requires Prescription', 'Barcode', 'SKU', 'Base Unit'],
    sample: [
      ['Paracetamol 500mg', 'Paracetamol', 'Analgesics', 'Tablet', '500mg', '2.50', '1.20', '50', 'no', '', 'PCM-500', 'tablet'],
      ['Amoxicillin 250mg/5ml', 'Amoxicillin', 'Antibiotics', 'Suspension', '250mg/5ml', '85', '60', '10', 'yes', '', '', 'bottle'],
    ],
  },
  'opening-stock': {
    label: 'Opening Stock',
    description: 'Add starting batches for medicines already in the catalog (matched by barcode, SKU or exact name). Quantity is in base units.',
    headers: ['Medicine', 'Barcode', 'SKU', 'Batch No', 'Quantity', 'Expiry Date', 'Purchase Price'],
    sample: [
      ['Paracetamol 500mg', '', '', 'LOT-001', '1000', '2027-12-31', '1.20'],
      ['', '', 'PCM-500', 'LOT-002', '500', '31/03/2028', '1.15'],
    ],
  },
};

const chunks = (rows) => {
  const out = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
};

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error(i18n.t('import:errors.readFile')));
    reader.readAsDataURL(file);
  });

const STATUS_CLS = {
  ok: 'text-emerald-600 dark:text-emerald-400',
  skip: 'text-slate-500',
  error: 'text-rose-600 dark:text-rose-400',
};

// Bulk import (#28): CSV parsed in the browser, .xlsx parsed by the server; rows are
// validated (dry run) and then committed in chunks of 500, each in one transaction.
const Import = () => {
  const { t } = useTranslation('import');
  const [kind, setKind] = useState('medicines');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [results, setResults] = useState(null); // { summary, results }
  const [committed, setCommitted] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const fileRef = useRef(null);

  const reset = () => {
    setRows([]);
    setResults(null);
    setCommitted(null);
    setFileName('');
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const switchKind = (k) => {
    setKind(k);
    reset();
  };

  const downloadTemplate = () => {
    const cfg = KINDS[kind];
    downloadCSV(`${kind}-import-template.csv`, toCSV(cfg.headers, cfg.sample));
  };

  const runAll = async (dryRun, sourceRows = rows) => {
    const all = [];
    let total = 0;
    for (const chunk of chunks(sourceRows)) {
       
      const res = await importRows(kind, chunk, dryRun);
      all.push(...(res.results || []));
      total += res.committed || 0;
      if (!dryRun && !res.success) {
        throw Object.assign(new Error(res.message || t('errors.importFailed')), { partial: total, results: all });
      }
    }
    const summary = {
      total: all.length,
      valid: all.filter((r) => r.status === 'ok').length,
      errors: all.filter((r) => r.status === 'error').length,
      skipped: all.filter((r) => r.status === 'skip').length,
    };
    return { summary, results: all, committed: total };
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setResults(null);
    setCommitted(null);
    setFileName(file.name);
    setBusy(true);
    try {
      let parsed;
      if (/\.csv$/i.test(file.name)) {
        parsed = parseCSV(await file.text());
      } else if (/\.xlsx$/i.test(file.name)) {
        if (file.size > MAX_XLSX_BYTES) {
          throw new Error(t('errors.tooLarge'));
        }
        parsed = await parseImportFile({ fileName: file.name, data: await fileToBase64(file) });
      } else {
        throw new Error(t('errors.badType'));
      }
      if (!parsed.rows.length) throw new Error(t('errors.noRows'));
      setRows(parsed.rows);
      setResults(await runAll(true, parsed.rows));
    } catch (err) {
      setRows([]);
      setError(err.response?.data?.message || err.message || t('errors.readFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleCommit = async () => {
    if (!window.confirm(t('confirmImport', { count: results.summary.valid }))) return;
    setBusy(true);
    setError('');
    try {
      const res = await runAll(false);
      setResults(res);
      setCommitted(res.committed);
    } catch (err) {
      if (err.results) setResults((prev) => ({ ...prev, results: err.results }));
      setError(
        `${err.response?.data?.message || err.message}${err.partial ? ` ${t('errors.partial', { count: err.partial })}` : ''}`
      );
    } finally {
      setBusy(false);
    }
  };

  const downloadErrors = () => {
    const bad = results.results.filter((r) => r.status === 'error');
    downloadCSV(`${kind}-import-errors.csv`, toCSV([t('csv.row'), t('csv.name'), t('csv.errors')], bad.map((r) => [r.row, r.name, r.errors.join('; ')])));
  };

  const cfg = KINDS[kind];
  const visible = results ? results.results.filter((r) => showAll || r.status !== 'ok') : [];

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto">
      <div className="pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 uppercase tracking-wider">
          {t('badge')}
        </span>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">{t('title')}</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {t('subtitle')}
        </p>
      </div>

      <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-medium w-fit">
        {Object.keys(KINDS).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => switchKind(k)}
            className={`px-4 py-1.5 rounded-lg transition cursor-pointer ${
              kind === k
                ? 'bg-white dark:bg-[#161c26] text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t(`kinds.${k}.label`)}
          </button>
        ))}
      </div>

      <div className={`${cardCls} p-5 space-y-4`}>
        <p className="text-xs text-slate-600 dark:text-slate-300">{t(`kinds.${kind}.description`)}</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {t('columns')} <span className="font-mono">{cfg.headers.join(', ')}</span>. {t('dateFormats')}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={secondaryBtn} onClick={downloadTemplate}>
            <FileDown className="w-4 h-4" /> {t('downloadTemplate')}
          </button>
          <label className={`${primaryBtn} ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
            <Upload className="w-4 h-4" /> {t('chooseFile')}
            <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={handleFile} />
          </label>
          {fileName && (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <FileSpreadsheet className="w-4 h-4" /> {fileName} ({t('rowCount', { count: rows.length })})
            </span>
          )}
          {busy && <span className="text-xs text-slate-500">{t('working')}</span>}
        </div>
      </div>

      {error && (
        <div className={`${errorBox} flex items-start gap-2`}>
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      {committed !== null && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle className="w-4 h-4" /> {t('imported', { count: committed })}
        </div>
      )}

      {results && (
        <div className={`${cardCls} overflow-hidden`}>
          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex flex-wrap gap-4 text-xs">
              <span>{t('summary.total')} <strong>{results.summary.total}</strong></span>
              <span className="text-emerald-600 dark:text-emerald-400">{t('summary.valid')} <strong>{results.summary.valid}</strong></span>
              <span className="text-slate-500">{t('summary.skipped')} <strong>{results.summary.skipped}</strong></span>
              <span className="text-rose-600 dark:text-rose-400">{t('summary.errors')} <strong>{results.summary.errors}</strong></span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" className="accent-emerald-600" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
                {t('showValid')}
              </label>
              {results.summary.errors > 0 && (
                <button type="button" className={secondaryBtn} onClick={downloadErrors}>
                  <FileDown className="w-4 h-4" /> {t('errorReport')}
                </button>
              )}
              {committed === null && (
                <button
                  type="button"
                  className={primaryBtn}
                  disabled={busy || results.summary.errors > 0 || results.summary.valid === 0}
                  onClick={handleCommit}
                  title={results.summary.errors ? t('fixErrors') : ''}
                >
                  <ShieldCheck className="w-4 h-4" /> {t('importRows', { count: results.summary.valid })}
                </button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className={theadCls}>
                <tr>
                  <th className="py-2.5 px-5">{t('table.row')}</th>
                  <th className="py-2.5 px-4">{t('table.item')}</th>
                  <th className="py-2.5 px-4">{t('table.status')}</th>
                  <th className="py-2.5 px-5">{t('table.details')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                {visible.map((r) => (
                  <tr key={r.row}>
                    <td className="py-2 px-5 font-mono">{r.row}</td>
                    <td className="py-2 px-4">{r.name || '-'}</td>
                    <td className={`py-2 px-4 font-semibold capitalize ${STATUS_CLS[r.status]}`}>{t(`status.${r.status}`, { defaultValue: r.status })}</td>
                    <td className="py-2 px-5">{r.errors?.length ? r.errors.join('; ') : r.message || ''}</td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr><td colSpan={4} className="py-8 text-center text-slate-500">{t('allValid')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Import;
