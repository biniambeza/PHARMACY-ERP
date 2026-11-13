import { useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck, Plus, ArrowLeft, Save, Send, CheckCircle, XCircle, Download, Search, RotateCcw,
} from 'lucide-react';
import {
  getStockTakes, getStockTake, startStockTake, saveStockTakeCounts, submitStockTake,
  reopenStockTake, approveStockTake, cancelStockTake,
} from '../../api/stockTakeApi';
import { getCategories } from '../../api/medicineApi';
import Can from '../../components/common/Can';
import { formatMoney, formatDate, formatDateTime } from '../../utils/format';
import { toCSV, downloadCSV } from '../../components/catalog/csv';
import {
  inputCls, labelCls, cardCls, primaryBtn, secondaryBtn, dangerBtn, theadCls, errorBox,
} from '../../components/catalog/styles';

const STATUS_STYLES = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  counting: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60',
  submitted: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
};

const StatusPill = ({ status }) => (
  <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border capitalize ${STATUS_STYLES[status] || ''}`}>
    {status}
  </span>
);

const SummaryTile = ({ label, value, tone = '' }) => (
  <div className={`${cardCls} p-4`}>
    <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">{label}</p>
    <p className={`text-lg font-bold font-mono mt-1 text-slate-900 dark:text-white ${tone}`}>{value}</p>
  </div>
);

const varianceTone = (v) =>
  v > 0 ? 'text-emerald-600 dark:text-emerald-400' : v < 0 ? 'text-rose-600 dark:text-rose-400' : '';

// ---------- Detail / counting view ----------
const StockTakeDetail = ({ id, onBack }) => {
  const [st, setSt] = useState(null);
  const [edits, setEdits] = useState({}); // lineId -> string
  const [search, setSearch] = useState('');
  const [varianceOnly, setVarianceOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    getStockTake(id)
      .then((res) => active && setSt(res.stockTake))
      .catch((err) => active && setError(err.response?.data?.message || 'Failed to load stock take'));
    return () => {
      active = false;
    };
  }, [id]);

  const dirtyCount = Object.keys(edits).length;
  const editable = st?.status === 'counting';

  const run = async (fn, okMessage) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fn();
      if (res?.stockTake) setSt(res.stockTake);
      if (okMessage) setNotice(okMessage);
      return true;
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveEdits = async () => {
    if (!dirtyCount) return true;
    const counts = Object.entries(edits).map(([lineId, v]) => ({
      lineId,
      countedQty: v === '' ? null : Number(v),
    }));
    const bad = counts.find((c) => c.countedQty !== null && (!Number.isInteger(c.countedQty) || c.countedQty < 0));
    if (bad) {
      setError('Counts must be whole numbers of 0 or more.');
      return false;
    }
    const ok = await run(() => saveStockTakeCounts(id, counts), `Saved ${counts.length} count(s)`);
    if (ok) setEdits({});
    return ok;
  };

  const handleSubmit = async () => {
    if (!(await saveEdits())) return;
    if (st.summary.uncountedLines > 0
      && !window.confirm(`${st.summary.uncountedLines} line(s) are not counted and will be left unchanged. Submit anyway?`)) return;
    await run(() => submitStockTake(id), 'Submitted for approval');
  };

  const handleApprove = async () => {
    if (!window.confirm(`Approve and apply ${st.summary.varianceLines} stock correction(s)? This cannot be undone.`)) return;
    await run(() => approveStockTake(id), 'Approved: stock corrected');
  };

  const handleCancel = async () => {
    if (!window.confirm('Cancel this stock take? Counts will be kept for reference but not applied.')) return;
    const ok = await run(() => cancelStockTake(id));
    if (ok) onBack();
  };

  const lines = useMemo(() => {
    if (!st) return [];
    const q = search.trim().toLowerCase();
    return st.lines.filter((l) => {
      if (varianceOnly && !l.variance) return false;
      if (!q) return true;
      return l.medicineName.toLowerCase().includes(q) || l.batchNo.toLowerCase().includes(q);
    });
  }, [st, search, varianceOnly]);

  const exportVariance = () => {
    const rows = st.lines.map((l) => [
      l.medicineName, l.category, l.batchNo, l.expiryDate ? String(l.expiryDate).slice(0, 10) : '',
      l.systemQty, l.countedQty ?? '', l.variance ?? '', l.unitCost, l.varianceValue ?? '',
    ]);
    downloadCSV(
      `${st.number}-variance.csv`,
      toCSV(['Medicine', 'Category', 'Batch', 'Expiry', 'System qty', 'Counted', 'Variance', 'Unit cost', 'Variance value'], rows)
    );
  };

  if (!st) {
    return (
      <div className="max-w-7xl mx-auto space-y-4">
        <button type="button" className={secondaryBtn} onClick={onBack}><ArrowLeft className="w-4 h-4" /> Back</button>
        {error ? <div className={errorBox}>{error}</div> : <p className="text-xs text-slate-500">Loading...</p>}
      </div>
    );
  }

  const s = st.summary;

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <button type="button" className={secondaryBtn} onClick={onBack} aria-label="Back"><ArrowLeft className="w-4 h-4" /></button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white font-mono">{st.number}</h1>
              <StatusPill status={st.status} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {st.scope?.category ? `Category: ${st.scope.category}` : 'All stock'} · started {formatDateTime(st.createdAt)}
              {st.createdBy?.name ? ` by ${st.createdBy.name}` : ''}
              {st.approvedAt ? ` · approved ${formatDateTime(st.approvedAt)}${st.approvedBy?.name ? ` by ${st.approvedBy.name}` : ''}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={secondaryBtn} onClick={exportVariance}><Download className="w-4 h-4" /> Variance CSV</button>
          {editable && (
            <>
              <button type="button" className={secondaryBtn} disabled={busy || !dirtyCount} onClick={saveEdits}>
                <Save className="w-4 h-4" /> Save{dirtyCount ? ` (${dirtyCount})` : ''}
              </button>
              <button type="button" className={primaryBtn} disabled={busy} onClick={handleSubmit}>
                <Send className="w-4 h-4" /> Submit
              </button>
            </>
          )}
          {st.status === 'submitted' && (
            <>
              <button type="button" className={secondaryBtn} disabled={busy} onClick={() => run(() => reopenStockTake(id), 'Reopened for counting')}>
                <RotateCcw className="w-4 h-4" /> Reopen
              </button>
              <Can perm="stock:adjust">
                <button type="button" className={primaryBtn} disabled={busy} onClick={handleApprove}>
                  <CheckCircle className="w-4 h-4" /> Approve & apply
                </button>
              </Can>
            </>
          )}
          {['draft', 'counting', 'submitted'].includes(st.status) && (
            <button type="button" className={dangerBtn} disabled={busy} onClick={handleCancel}>
              <XCircle className="w-4 h-4" /> Cancel
            </button>
          )}
        </div>
      </div>

      {error && <div className={errorBox}>{error}</div>}
      {notice && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 text-xs text-emerald-700 dark:text-emerald-300">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryTile label="Counted" value={`${s.countedLines} / ${s.totalLines}`} />
        <SummaryTile label="Lines with variance" value={s.varianceLines} />
        <SummaryTile label="Net variance (units)" value={s.netVarianceQty > 0 ? `+${s.netVarianceQty}` : s.netVarianceQty} tone={varianceTone(s.netVarianceQty)} />
        <SummaryTile label="Shortage value" value={formatMoney(s.shortageValue)} tone={s.shortageValue < 0 ? 'text-rose-600 dark:text-rose-400' : ''} />
        <SummaryTile label="Net variance value" value={formatMoney(s.netVarianceValue)} tone={varianceTone(s.netVarianceValue)} />
      </div>

      <div className={`${cardCls} p-4 flex flex-col sm:flex-row gap-3 sm:items-center justify-between`}>
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input className={`${inputCls} pl-9`} placeholder="Search medicine or batch..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="accent-emerald-600" checked={varianceOnly} onChange={(e) => setVarianceOnly(e.target.checked)} />
          Show variances only
        </label>
      </div>

      <div className={`${cardCls} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={theadCls}>
              <tr>
                <th className="py-3 px-5">Medicine</th>
                <th className="py-3 px-4">Batch</th>
                <th className="py-3 px-4">Expiry</th>
                <th className="py-3 px-4 text-right">System qty</th>
                <th className="py-3 px-4 text-right">Counted</th>
                <th className="py-3 px-4 text-right">Variance</th>
                <th className="py-3 px-5 text-right">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/80 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
              {lines.map((l) => {
                const edited = edits[l._id];
                const shown = edited !== undefined ? edited : (l.countedQty ?? '');
                const counted = shown === '' ? null : Number(shown);
                const variance = counted === null || Number.isNaN(counted) ? null : counted - l.systemQty;
                const value = variance === null ? null : variance * (l.unitCost || 0);
                const expired = l.expiryDate && new Date(l.expiryDate) <= new Date();
                return (
                  <tr key={l._id} className={edited !== undefined ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}>
                    <td className="py-2 px-5">
                      <span className="font-semibold text-slate-900 dark:text-white">{l.medicineName}</span>
                      <span className="block text-[10px] text-slate-400">{l.category}</span>
                    </td>
                    <td className="py-2 px-4 font-mono">{l.batchNo}</td>
                    <td className={`py-2 px-4 ${expired ? 'text-rose-600 dark:text-rose-400 font-semibold' : ''}`}>
                      {formatDate(l.expiryDate)}{expired ? ' (expired)' : ''}
                    </td>
                    <td className="py-2 px-4 text-right font-mono">{l.systemQty}</td>
                    <td className="py-2 px-4 text-right">
                      {editable ? (
                        <input
                          type="number"
                          min="0"
                          step="1"
                          aria-label={`Counted quantity for ${l.medicineName} batch ${l.batchNo}`}
                          className={`${inputCls} w-24 text-right font-mono`}
                          value={shown}
                          onChange={(e) => setEdits((prev) => ({ ...prev, [l._id]: e.target.value }))}
                        />
                      ) : (
                        <span className="font-mono">{l.countedQty ?? '-'}</span>
                      )}
                    </td>
                    <td className={`py-2 px-4 text-right font-mono font-bold ${varianceTone(variance)}`}>
                      {variance === null ? '-' : variance > 0 ? `+${variance}` : variance}
                    </td>
                    <td className={`py-2 px-5 text-right font-mono ${varianceTone(value)}`}>
                      {value === null ? '-' : formatMoney(value)}
                    </td>
                  </tr>
                );
              })}
              {lines.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-slate-500">No lines match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        On approval each variance (counted - system qty at start) is applied to the batch&apos;s current quantity, so sales made
        during the count are kept. Uncounted lines are left unchanged.
      </p>
    </div>
  );
};

// ---------- List view ----------
const StockTake = () => {
  const [openId, setOpenId] = useState(null);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    getCategories().then((res) => setCategories(res.categories || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (openId) return undefined;
    let active = true;
    getStockTakes({ limit: 50 })
      .then((res) => active && setItems(res.stockTakes || []))
      .catch((err) => active && setError(err.response?.data?.message || 'Failed to load stock takes'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [openId, reloadKey]);

  const handleStart = async () => {
    setStarting(true);
    setError('');
    try {
      const res = await startStockTake({ scope: category ? { category } : {}, notes });
      setNotes('');
      setOpenId(res.stockTake._id);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to start stock take');
    } finally {
      setStarting(false);
    }
  };

  if (openId) {
    return (
      <StockTakeDetail
        id={openId}
        onBack={() => {
          setOpenId(null);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 uppercase tracking-wider">
          Physical Inventory
        </span>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">Stock Take</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Snapshot stock, count each batch, review variances and apply corrections
        </p>
      </div>

      {error && <div className={errorBox}>{error}</div>}

      <div className={`${cardCls} p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end`}>
        <div>
          <label className={labelCls}>Scope</label>
          <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All stock</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Notes</label>
          <input className={inputCls} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Month-end count, shelf A-C" />
        </div>
        <button type="button" className={`${primaryBtn} justify-center`} disabled={starting} onClick={handleStart}>
          <Plus className="w-4 h-4" /> {starting ? 'Starting...' : 'Start count'}
        </button>
      </div>

      <div className={`${cardCls} overflow-hidden`}>
        <div className="overflow-x-auto">
          {loading ? (
            <p className="p-8 text-xs text-slate-500">Loading...</p>
          ) : items.length === 0 ? (
            <div className="py-16 text-center">
              <ClipboardCheck className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm font-bold text-slate-900 dark:text-white">No stock takes yet</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Start a count above</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className={theadCls}>
                <tr>
                  <th className="py-3 px-5">Number</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Scope</th>
                  <th className="py-3 px-4 text-right">Counted</th>
                  <th className="py-3 px-4 text-right">Net variance value</th>
                  <th className="py-3 px-4">Started</th>
                  <th className="py-3 px-5">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                {items.map((st) => (
                  <tr
                    key={st._id}
                    onClick={() => setOpenId(st._id)}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 cursor-pointer"
                  >
                    <td className="py-3 px-5 font-mono font-bold text-slate-900 dark:text-white">{st.number}</td>
                    <td className="py-3 px-4"><StatusPill status={st.status} /></td>
                    <td className="py-3 px-4">{st.scope?.category || 'All stock'}</td>
                    <td className="py-3 px-4 text-right font-mono">{st.summary.countedLines} / {st.summary.totalLines}</td>
                    <td className={`py-3 px-4 text-right font-mono ${varianceTone(st.summary.netVarianceValue)}`}>
                      {formatMoney(st.summary.netVarianceValue)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">{formatDateTime(st.createdAt)}</td>
                    <td className="py-3 px-5">{st.createdBy?.name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default StockTake;
