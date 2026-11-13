import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, Printer, RefreshCw } from 'lucide-react';
import { getControlledRegister, getControlledMedicines } from '../../api/clinicalApi';
import { CardSkeleton } from '../../components/common/SkeletonLoader';
import { cardCls, inputCls, labelCls, primaryBtn, secondaryBtn, errMsg } from '../../components/clinical/ui';
import { formatDate, formatDateTime } from '../../utils/format';

const ENTRY_LABELS = { dispense: 'Dispensed', receive: 'Received', return: 'Returned', adjust: 'Adjustment' };

const firstOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const todayStr = () => new Date().toISOString().slice(0, 10);

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Builds a standalone printable register document (one section per medicine).
const buildPrintHtml = (data, filters) => {
  const ph = data.pharmacy || {};
  const sections = data.groups
    .map((g) => {
      const m = g.medicine;
      const rows = g.entries
        .map(
          (e) => `<tr>
            <td>${esc(formatDateTime(e.date))}</td>
            <td>${esc(ENTRY_LABELS[e.entryType] || e.entryType)}</td>
            <td>${esc(e.patient?.name || '')}</td>
            <td>${esc(e.prescriberName || '')}</td>
            <td>${esc(e.prescriptionNumber || '')}</td>
            <td>${esc(e.batch?.batchNo || '')}</td>
            <td class="n">${e.quantityIn || ''}</td>
            <td class="n">${e.quantityOut || ''}</td>
            <td class="n"><b>${e.balanceAfter}</b></td>
            <td>${esc(e.user?.name || '')}</td>
            <td></td>
          </tr>`
        )
        .join('');
      return `<section>
        <h2>${esc(m.name)} ${esc(m.strength || '')} ${m.genericName ? `(${esc(m.genericName)})` : ''}</h2>
        <p class="meta">Form: ${esc(m.dosageForm || '')} · Schedule: ${esc(m.controlledSchedule || '—')} · Unit: ${esc(m.baseUnit || 'unit')}</p>
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Patient</th><th>Prescriber</th><th>Rx No.</th><th>Batch</th><th>In</th><th>Out</th><th>Balance</th><th>Pharmacist</th><th>Signature</th></tr></thead>
          <tbody>
            <tr class="ob"><td colspan="8">Opening balance</td><td class="n"><b>${g.openingBalance}</b></td><td colspan="2"></td></tr>
            ${rows || '<tr><td colspan="11" class="empty">No movements in this period</td></tr>'}
            <tr class="ob"><td colspan="6">Closing balance</td><td class="n">${g.totalIn}</td><td class="n">${g.totalOut}</td><td class="n"><b>${g.closingBalance}</b></td><td colspan="2"></td></tr>
          </tbody>
        </table>
      </section>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Controlled Substances Register</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;margin:24px}
    h1{font-size:16px;margin:0} h2{font-size:13px;margin:18px 0 2px} .meta{margin:0 0 6px;color:#444}
    table{width:100%;border-collapse:collapse} th,td{border:1px solid #999;padding:4px;text-align:left;vertical-align:top}
    th{background:#eee} .n{text-align:right} .ob td{background:#f6f6f6} .empty{text-align:center;color:#666}
    section{page-break-inside:avoid} .sig{margin-top:32px;display:flex;gap:48px}
    @page{size:landscape;margin:12mm}
  </style></head><body>
  <h1>Controlled Substances Register</h1>
  <p>${esc(ph.name || '')} · License: ${esc(ph.licenseNo || '')} · ${esc(ph.address || '')}<br/>
  Period: ${esc(filters.from ? formatDate(filters.from) : 'start')} – ${esc(filters.to ? formatDate(filters.to) : 'today')} · Printed: ${esc(formatDateTime(new Date()))}</p>
  ${sections || '<p>No controlled medicines.</p>'}
  <div class="sig"><div>Responsible pharmacist: ____________________</div><div>Signature: ____________</div><div>Date: ____________</div></div>
  </body></html>`;
};

const ControlledRegister = () => {
  const [medicines, setMedicines] = useState([]);
  const [filters, setFilters] = useState({ medicineId: '', from: firstOfMonth(), to: todayStr() });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getControlledMedicines().then((d) => setMedicines(d.medicines || [])).catch(() => setMedicines([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params[k] = v;
      });
      setData(await getControlledRegister(params));
    } catch (err) {
      setError(errMsg(err, 'Failed to load register'));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Initial load only; later loads happen on "Apply"
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePrint = () => {
    if (!data) return;
    const w = window.open('', '_blank');
    if (!w) return setError('Allow pop-ups to print the register.');
    w.document.open();
    w.document.write(buildPrintHtml(data, filters));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 px-2.5 py-0.5 rounded-full border border-rose-200 dark:border-rose-800/60 uppercase tracking-wider">
            Compliance
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">Controlled Substances Register</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Every dispense and receipt of controlled medicines with running balances</p>
        </div>
        <button onClick={handlePrint} disabled={!data} className={`${primaryBtn} self-start sm:self-auto`}>
          <Printer className="w-4 h-4" /> Print Register
        </button>
      </div>

      <div className={`${cardCls} p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end`}>
        <div>
          <label className={labelCls}>Medicine</label>
          <select className={inputCls} value={filters.medicineId} onChange={set('medicineId')}>
            <option value="">All controlled medicines</option>
            {medicines.map((m) => (
              <option key={m._id} value={m._id}>{m.name} {m.strength} (stock {m.currentStock})</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>From</label>
          <input type="date" className={inputCls} value={filters.from} onChange={set('from')} />
        </div>
        <div>
          <label className={labelCls}>To</label>
          <input type="date" className={inputCls} value={filters.to} onChange={set('to')} />
        </div>
        <button onClick={load} className={secondaryBtn}><RefreshCw className="w-3.5 h-3.5" /> Apply</button>
      </div>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      {loading ? (
        <CardSkeleton height="h-64" />
      ) : !data || data.groups.length === 0 ? (
        <div className={`${cardCls} py-16 text-center`}>
          <ShieldAlert className="w-8 h-8 text-rose-500 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-900 dark:text-white">No controlled medicines</p>
          <p className="text-xs text-slate-500 mt-1">Flag medicines as controlled in the medicine catalog to track them here.</p>
        </div>
      ) : (
        data.groups.map((g) => (
          <div key={g.medicine._id} className={`${cardCls} overflow-hidden`}>
            <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  {g.medicine.name} {g.medicine.strength}
                  {g.medicine.controlledSchedule && (
                    <span className="ml-2 text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded">Schedule {g.medicine.controlledSchedule}</span>
                  )}
                </h2>
                <p className="text-[11px] text-slate-500">{g.medicine.genericName}</p>
              </div>
              <div className="flex gap-4 text-xs text-slate-600 dark:text-slate-300">
                <span>Opening <b>{g.openingBalance}</b></span>
                <span className="text-emerald-600">In <b>{g.totalIn}</b></span>
                <span className="text-rose-600">Out <b>{g.totalOut}</b></span>
                <span>Closing <b>{g.closingBalance}</b></span>
                <span className="text-slate-400">Stock now {g.currentStock}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="py-2 px-5">Date</th><th>Type</th><th>Patient</th><th>Prescriber</th><th>Rx No.</th>
                    <th>Batch</th><th>Invoice</th><th className="text-right">In</th><th className="text-right">Out</th>
                    <th className="text-right">Balance</th><th className="px-5">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {g.entries.length === 0 && (
                    <tr><td colSpan={11} className="py-4 px-5 italic text-slate-400">No movements in this period</td></tr>
                  )}
                  {g.entries.map((e) => (
                    <tr key={e._id}>
                      <td className="py-2 px-5 whitespace-nowrap">{formatDateTime(e.date)}</td>
                      <td>{ENTRY_LABELS[e.entryType] || e.entryType}</td>
                      <td>{e.patient?.name || '—'}</td>
                      <td>{e.prescriberName || '—'}</td>
                      <td className="font-mono">{e.prescriptionNumber || '—'}</td>
                      <td className="font-mono">{e.batch?.batchNo || '—'}</td>
                      <td className="font-mono">{e.sale?.invoiceNumber || '—'}</td>
                      <td className="text-right text-emerald-600">{e.quantityIn || ''}</td>
                      <td className="text-right text-rose-600">{e.quantityOut || ''}</td>
                      <td className="text-right font-bold">{e.balanceAfter}</td>
                      <td className="px-5">{e.user?.name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
      {data?.truncated && <p className="text-[11px] text-amber-600">Showing the first 5000 entries; narrow the date range.</p>}
    </div>
  );
};

export default ControlledRegister;
