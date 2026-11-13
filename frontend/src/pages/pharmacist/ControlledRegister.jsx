import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, Printer, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getControlledRegister, getControlledMedicines } from '../../api/clinicalApi';
import { CardSkeleton } from '../../components/common/SkeletonLoader';
import { cardCls, inputCls, labelCls, primaryBtn, secondaryBtn, errMsg } from '../../components/clinical/ui';
import { formatDate, formatDateTime } from '../../utils/format';
import EthiopianDateHint from '../../components/common/EthiopianDateHint';

// Labels are i18n keys in the `controlled` namespace (entryTypes.<type>).
const ENTRY_TYPES = ['dispense', 'receive', 'return', 'adjust'];
const entryLabel = (t, type) => (ENTRY_TYPES.includes(type) ? t(`entryTypes.${type}`) : type);

const firstOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const todayStr = () => new Date().toISOString().slice(0, 10);

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Builds a standalone printable register document (one section per medicine).
const buildPrintHtml = (data, filters, t) => {
  const ph = data.pharmacy || {};
  const h = (k, o) => esc(t(k, o));
  const sections = data.groups
    .map((g) => {
      const m = g.medicine;
      const rows = g.entries
        .map(
          (e) => `<tr>
            <td>${esc(formatDateTime(e.date))}</td>
            <td>${esc(entryLabel(t, e.entryType))}</td>
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
        <p class="meta">${h('print.form')} ${esc(m.dosageForm || '')} · ${h('print.schedule')} ${esc(m.controlledSchedule || '—')} · ${h('print.unit')} ${esc(m.baseUnit || 'unit')}</p>
        <table>
          <thead><tr><th>${h('cols.date')}</th><th>${h('cols.type')}</th><th>${h('cols.patient')}</th><th>${h('cols.prescriber')}</th><th>${h('cols.rxNo')}</th><th>${h('cols.batch')}</th><th>${h('cols.in')}</th><th>${h('cols.out')}</th><th>${h('cols.balance')}</th><th>${h('print.pharmacist')}</th><th>${h('print.signature')}</th></tr></thead>
          <tbody>
            <tr class="ob"><td colspan="8">${h('opening')}</td><td class="n"><b>${g.openingBalance}</b></td><td colspan="2"></td></tr>
            ${rows || `<tr><td colspan="11" class="empty">${h('noMovements')}</td></tr>`}
            <tr class="ob"><td colspan="6">${h('closing')}</td><td class="n">${g.totalIn}</td><td class="n">${g.totalOut}</td><td class="n"><b>${g.closingBalance}</b></td><td colspan="2"></td></tr>
          </tbody>
        </table>
      </section>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${h('title')}</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;margin:24px}
    h1{font-size:16px;margin:0} h2{font-size:13px;margin:18px 0 2px} .meta{margin:0 0 6px;color:#444}
    table{width:100%;border-collapse:collapse} th,td{border:1px solid #999;padding:4px;text-align:left;vertical-align:top}
    th{background:#eee} .n{text-align:right} .ob td{background:#f6f6f6} .empty{text-align:center;color:#666}
    section{page-break-inside:avoid} .sig{margin-top:32px;display:flex;gap:48px}
    @page{size:landscape;margin:12mm}
  </style></head><body>
  <h1>${h('title')}</h1>
  <p>${esc(ph.name || '')} · ${h('print.license')} ${esc(ph.licenseNo || '')} · ${esc(ph.address || '')}<br/>
  ${h('print.period')} ${esc(filters.from ? formatDate(filters.from) : t('print.start'))} – ${esc(filters.to ? formatDate(filters.to) : t('print.today'))} · ${h('print.printed')} ${esc(formatDateTime(new Date()))}</p>
  ${sections || `<p>${h('print.noMedicines')}</p>`}
  <div class="sig"><div>${h('print.responsible')} ____________________</div><div>${h('print.signatureLine')} ____________</div><div>${h('print.dateLine')} ____________</div></div>
  </body></html>`;
};

const ControlledRegister = () => {
  const { t } = useTranslation('controlled');
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
      setError(errMsg(err, t('errors.load')));
    } finally {
      setLoading(false);
    }
  }, [filters, t]);

  // Initial load only; later loads happen on "Apply"
  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePrint = () => {
    if (!data) return;
    const w = window.open('', '_blank');
    if (!w) return setError(t('errors.popups'));
    w.document.open();
    w.document.write(buildPrintHtml(data, filters, t));
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
            {t('badge')}
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">{t('title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('subtitle')}</p>
        </div>
        <button onClick={handlePrint} disabled={!data} className={`${primaryBtn} self-start sm:self-auto`}>
          <Printer className="w-4 h-4" /> {t('printRegister')}
        </button>
      </div>

      <div className={`${cardCls} p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end`}>
        <div>
          <label className={labelCls}>{t('filters.medicine')}</label>
          <select className={inputCls} value={filters.medicineId} onChange={set('medicineId')}>
            <option value="">{t('filters.all')}</option>
            {medicines.map((m) => (
              <option key={m._id} value={m._id}>{t('filters.option', { name: m.name, strength: m.strength ?? '', stock: m.currentStock })}</option>
            ))}
          </select>
        </div>
        <div className="relative">
          <label htmlFor="controlled-from" className={labelCls}>{t('filters.from')}</label>
          <input id="controlled-from" type="date" className={inputCls} value={filters.from} onChange={set('from')} aria-describedby="controlled-from-eth" />
          <EthiopianDateHint value={filters.from} id="controlled-from-eth" className="absolute left-0 top-full whitespace-nowrap" />
        </div>
        <div className="relative">
          <label htmlFor="controlled-to" className={labelCls}>{t('filters.to')}</label>
          <input id="controlled-to" type="date" className={inputCls} value={filters.to} onChange={set('to')} aria-describedby="controlled-to-eth" />
          <EthiopianDateHint value={filters.to} id="controlled-to-eth" className="absolute left-0 top-full whitespace-nowrap" />
        </div>
        <button onClick={load} className={secondaryBtn}><RefreshCw className="w-3.5 h-3.5" /> {t('filters.apply')}</button>
      </div>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      {loading ? (
        <CardSkeleton height="h-64" />
      ) : !data || data.groups.length === 0 ? (
        <div className={`${cardCls} py-16 text-center`}>
          <ShieldAlert className="w-8 h-8 text-rose-500 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-900 dark:text-white">{t('empty.title')}</p>
          <p className="text-xs text-slate-500 mt-1">{t('empty.hint')}</p>
        </div>
      ) : (
        data.groups.map((g) => (
          <div key={g.medicine._id} className={`${cardCls} overflow-hidden`}>
            <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  {g.medicine.name} {g.medicine.strength}
                  {g.medicine.controlledSchedule && (
                    <span className="ml-2 text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded">{t('scheduleTag', { schedule: g.medicine.controlledSchedule })}</span>
                  )}
                </h2>
                <p className="text-[11px] text-slate-500">{g.medicine.genericName}</p>
              </div>
              <div className="flex gap-4 text-xs text-slate-600 dark:text-slate-300">
                <span>{t('stats.opening')} <b>{g.openingBalance}</b></span>
                <span className="text-emerald-600">{t('cols.in')} <b>{g.totalIn}</b></span>
                <span className="text-rose-600">{t('cols.out')} <b>{g.totalOut}</b></span>
                <span>{t('stats.closing')} <b>{g.closingBalance}</b></span>
                <span className="text-slate-400">{t('stats.stockNow', { stock: g.currentStock })}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="py-2 px-5">{t('cols.date')}</th><th>{t('cols.type')}</th><th>{t('cols.patient')}</th><th>{t('cols.prescriber')}</th><th>{t('cols.rxNo')}</th>
                    <th>{t('cols.batch')}</th><th>{t('cols.invoice')}</th><th className="text-right">{t('cols.in')}</th><th className="text-right">{t('cols.out')}</th>
                    <th className="text-right">{t('cols.balance')}</th><th className="px-5">{t('cols.by')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {g.entries.length === 0 && (
                    <tr><td colSpan={11} className="py-4 px-5 italic text-slate-400">{t('noMovements')}</td></tr>
                  )}
                  {g.entries.map((e) => (
                    <tr key={e._id}>
                      <td className="py-2 px-5 whitespace-nowrap">{formatDateTime(e.date)}</td>
                      <td>{entryLabel(t, e.entryType)}</td>
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
      {data?.truncated && <p className="text-[11px] text-amber-600">{t('truncated')}</p>}
    </div>
  );
};

export default ControlledRegister;
