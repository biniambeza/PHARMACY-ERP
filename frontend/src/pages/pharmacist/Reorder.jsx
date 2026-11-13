import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCcw, Building2, AlertTriangle, ShoppingCart, AlertCircle, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getReorderSuggestions, createReorderPOs } from '../../api/reorderApi';
import { getSuppliers } from '../../api/supplierApi';
import Can from '../../components/common/Can';
import { CardSkeleton } from '../../components/common/SkeletonLoader';
import { formatMoney } from '../../utils/format';

const WINDOWS = [30, 60, 90];

const inputCls =
  'w-24 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition';

const groupKey = (g) => (g.supplier ? String(g.supplier._id) : 'none');

const Reorder = () => {
  const { t, i18n } = useTranslation('reorder');
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [groups, setGroups] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  // rows keyed by medicineId: { selected, quantity, unitCost }
  const [rows, setRows] = useState({});
  // supplier chosen for the "no preferred supplier" group
  const [fallbackSupplierId, setFallbackSupplierId] = useState('');
  const [asDraft, setAsDraft] = useState(true);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getReorderSuggestions(days);
      const nextGroups = data.groups || [];
      setGroups(nextGroups);
      const next = {};
      nextGroups.forEach((g) =>
        g.items.forEach((it) => {
          next[String(it.medicineId)] = {
            selected: it.suggestedQuantity > 0,
            quantity: it.suggestedQuantity,
            unitCost: it.unitCost,
          };
        })
      );
      setRows(next);
    } catch (err) {
      setError(err.response?.data?.message || i18n.t('reorder:errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [days, i18n]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getSuppliers({ status: 'active' })
      .then((res) => setSuppliers(res.suppliers || []))
      .catch(() => setSuppliers([]));
  }, []);

  const updateRow = (id, patch) => setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const toggleGroup = (g, selected) =>
    setRows((prev) => {
      const next = { ...prev };
      g.items.forEach((it) => {
        const id = String(it.medicineId);
        next[id] = { ...next[id], selected };
      });
      return next;
    });

  const selection = useMemo(() => {
    const lines = [];
    let total = 0;
    groups.forEach((g) =>
      g.items.forEach((it) => {
        const r = rows[String(it.medicineId)];
        if (!r || !r.selected) return;
        const qty = Number(r.quantity) || 0;
        const cost = Number(r.unitCost) || 0;
        total += qty * cost;
        lines.push({ group: groupKey(g), medicineId: it.medicineId, name: it.name, quantity: qty, unitCost: cost });
      })
    );
    return { lines, total };
  }, [groups, rows]);

  const handleCreate = async () => {
    setError('');
    setMessage('');
    const { lines } = selection;
    if (lines.length === 0) return setError(t('errors.selectOne'));
    const bad = lines.find((l) => !Number.isInteger(l.quantity) || l.quantity <= 0);
    if (bad) return setError(t('errors.badQuantity', { name: bad.name }));
    const needsSupplier = lines.some((l) => l.group === 'none');
    if (needsSupplier && !fallbackSupplierId) {
      return setError(t('errors.chooseSupplier'));
    }

    setCreating(true);
    try {
      const res = await createReorderPOs({
        status: asDraft ? 'draft' : 'ordered',
        lines: lines.map((l) => ({
          medicineId: l.medicineId,
          quantity: l.quantity,
          unitCost: l.unitCost,
          ...(l.group === 'none' ? { supplierId: fallbackSupplierId } : {}),
        })),
      });
      setMessage(res.message || t('created'));
      await load();
    } catch (err) {
      setError(err.response?.data?.message || t('errors.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const totalItems = groups.reduce((s, g) => s + g.items.length, 0);

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 uppercase tracking-wider">
            {t('badge')}
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">
            {t('title')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-medium">
            {WINDOWS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
                  days === d
                    ? 'bg-white dark:bg-[#161c26] text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t('days', { count: d })}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-lg transition cursor-pointer"
            title={t('common:buttons.refresh')}
          >
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
          <span>{error}</span>
        </div>
      )}
      {message && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 flex items-center justify-between gap-2.5 text-xs text-emerald-700 dark:text-emerald-300">
          <span className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" /> {message}
          </span>
          <button onClick={() => navigate('/pharmacy/procurement')} className="font-semibold hover:underline cursor-pointer">
            {t('viewPOs')}
          </button>
        </div>
      )}

      {loading ? (
        <CardSkeleton height="h-64" />
      ) : totalItems === 0 ? (
        <div className="bg-white dark:bg-[#161c26] border border-slate-100/90 dark:border-slate-800/80 rounded-2xl py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3">
            <CheckCircle className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-slate-900 dark:text-white">{t('empty.title')}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('empty.hint', { count: days })}
          </p>
        </div>
      ) : (
        <>
          {groups.map((g) => {
            const key = groupKey(g);
            const allSelected = g.items.every((it) => rows[String(it.medicineId)]?.selected);
            return (
              <div
                key={key}
                className="bg-white dark:bg-[#161c26] border border-slate-100/90 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)]"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                      {g.supplier ? g.supplier.name : t('noPreferredSupplier')}
                    </span>
                    <span className="text-[11px] text-slate-500">({t('itemCount', { count: g.items.length })})</span>
                  </div>
                  {!g.supplier && (
                    <select
                      value={fallbackSupplierId}
                      onChange={(e) => setFallbackSupplierId(e.target.value)}
                      className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white cursor-pointer"
                    >
                      <option value="">{t('orderFrom')}</option>
                      {suppliers.map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800 text-[10px]">
                      <tr>
                        <th className="py-2.5 px-4 w-8">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={(e) => toggleGroup(g, e.target.checked)}
                            className="cursor-pointer accent-emerald-600"
                            aria-label={t('selectAllInGroup')}
                          />
                        </th>
                        <th className="py-2.5 px-3">{t('table.medicine')}</th>
                        <th className="py-2.5 px-3 text-right">{t('table.avgPerDay')}</th>
                        <th className="py-2.5 px-3 text-right">{t('table.leadSafety')}</th>
                        <th className="py-2.5 px-3 text-right">{t('table.stock')}</th>
                        <th className="py-2.5 px-3 text-right">{t('table.onOrder')}</th>
                        <th className="py-2.5 px-3 text-right">{t('table.suggested')}</th>
                        <th className="py-2.5 px-3">{t('table.orderQty')}</th>
                        <th className="py-2.5 px-3">{t('table.unitCost')}</th>
                        <th className="py-2.5 px-4 text-right">{t('table.lineTotal')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/80 dark:divide-slate-800/60">
                      {g.items.map((it) => {
                        const id = String(it.medicineId);
                        const r = rows[id] || {};
                        return (
                          <tr key={id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                            <td className="py-2.5 px-4">
                              <input
                                type="checkbox"
                                checked={!!r.selected}
                                onChange={(e) => updateRow(id, { selected: e.target.checked })}
                                className="cursor-pointer accent-emerald-600"
                                aria-label={t('selectItem', { name: it.name })}
                              />
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="font-bold text-slate-900 dark:text-white block">{it.name}</span>
                              <span className="text-[10px] text-slate-400">
                                {[it.strength, it.dosageForm].filter(Boolean).join(' · ')}
                              </span>
                              {it.belowMinStock && (
                                <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                  <AlertTriangle className="w-3 h-3" /> {t('belowMinimum', { min: it.minStockLevel })}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">{it.avgDailySales}</td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              {t('leadSafetyValue', { lead: it.leadTimeDays, safety: it.reorderSafetyDays })}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">{it.currentStock}</td>
                            <td className="py-2.5 px-3 text-right font-mono">{it.onOrder}</td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                              {it.suggestedQuantity}
                            </td>
                            <td className="py-2.5 px-3">
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={r.quantity ?? ''}
                                onChange={(e) => updateRow(id, { quantity: e.target.value, selected: true })}
                                className={inputCls}
                              />
                            </td>
                            <td className="py-2.5 px-3">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={r.unitCost ?? ''}
                                onChange={(e) => updateRow(id, { unitCost: e.target.value })}
                                className={inputCls}
                              />
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono">
                              {formatMoney((Number(r.quantity) || 0) * (Number(r.unitCost) || 0))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {/* Action bar */}
          <Can perm="po:manage">
            <div className="sticky bottom-4 bg-white dark:bg-[#161c26] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-slate-600 dark:text-slate-300">
                <strong>{selection.lines.length}</strong> {t('itemsSelected', { count: selection.lines.length })} ·{' '}
                <span className="font-mono font-bold">{formatMoney(selection.total)}</span>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={asDraft}
                    onChange={(e) => setAsDraft(e.target.checked)}
                    className="accent-emerald-600"
                  />
                  {t('createAsDrafts')}
                </label>
                <button
                  onClick={handleCreate}
                  disabled={creating || selection.lines.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer"
                >
                  <ShoppingCart className="w-4 h-4" />
                  {creating ? t('creating') : t('createPOs')}
                </button>
              </div>
            </div>
          </Can>
        </>
      )}
    </div>
  );
};

export default Reorder;
