import { useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2, Search, Truck, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { getStockBatches } from '../../api/stockApi';
import { createTransfer, getTransferDestinations } from '../../api/transferApi';
import { formatDate } from '../../utils/format';

const inputClass =
  'w-full px-3 py-2 bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition';

// Groups usable (active, non-expired, quantity > 0) batches by medicine.
const groupByMedicine = (batches) => {
  const now = Date.now();
  const map = new Map();
  for (const b of batches) {
    const med = b.medicineId;
    if (!med || !med._id) continue;
    if (b.status !== 'active' || b.quantity <= 0 || new Date(b.expiryDate).getTime() <= now) continue;
    if (!map.has(med._id)) map.set(med._id, { medicine: med, batches: [], total: 0 });
    const entry = map.get(med._id);
    entry.batches.push(b);
    entry.total += b.quantity;
  }
  return [...map.values()].sort((a, b) => a.medicine.name.localeCompare(b.medicine.name));
};

const CreateTransferModal = ({ isOpen, onClose, onCreated }) => {
  const { t } = useTranslation('transfers');
  const [destinations, setDestinations] = useState([]);
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toPharmacyId, setToPharmacyId] = useState('');
  const [lines, setLines] = useState([]);
  const [search, setSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setLines([]);
    setNotes('');
    setSearch('');
    Promise.all([getTransferDestinations(), getStockBatches({ status: 'active' })])
      .then(([d, s]) => {
        if (cancelled) return;
        setDestinations(d.branches || []);
        setToPharmacyId(d.branches?.[0]?._id || '');
        setStock(groupByMedicine(s.batches || []));
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || i18n.t('transfers:create.errors.load'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const stockById = useMemo(() => new Map(stock.map((s) => [s.medicine._id, s])), [stock]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return stock
      .filter(
        (s) =>
          s.medicine.name.toLowerCase().includes(q) ||
          (s.medicine.genericName || '').toLowerCase().includes(q) ||
          (s.medicine.barcode || '').toLowerCase() === q
      )
      .slice(0, 8);
  }, [search, stock]);

  if (!isOpen) return null;

  const addLine = (entry) => {
    setLines((prev) => [...prev, { key: `${entry.medicine._id}-${Date.now()}`, medicineId: entry.medicine._id, batchId: '', quantity: 1 }]);
    setSearch('');
  };

  const updateLine = (key, patch) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key) => setLines((prev) => prev.filter((l) => l.key !== key));

  const lineError = (line) => {
    const entry = stockById.get(line.medicineId);
    if (!entry) return t('create.errors.noStock');
    const qty = Number(line.quantity);
    if (!Number.isInteger(qty) || qty < 1) return t('create.errors.wholeQty');
    const available = line.batchId ? entry.batches.find((b) => b._id === line.batchId)?.quantity || 0 : entry.total;
    if (qty > available) return t('create.errors.onlyAvailable', { count: available });
    return '';
  };

  const submit = async (draft) => {
    setError('');
    if (!toPharmacyId) return setError(t('create.errors.destination'));
    if (!lines.length) return setError(t('create.errors.noLines'));
    const bad = lines.find((l) => lineError(l));
    if (bad) return setError(lineError(bad));
    setSaving(true);
    try {
      await createTransfer({
        toPharmacyId,
        notes,
        draft,
        lines: lines.map((l) => ({
          medicineId: l.medicineId,
          ...(l.batchId ? { batchId: l.batchId } : {}),
          quantity: Number(l.quantity),
        })),
      });
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || t('create.errors.save'));
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-[#161c26] rounded-2xl border border-slate-100 dark:border-slate-800 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Truck className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('create.title')}</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('create.subtitle')}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label={t('common:buttons.close')} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500 py-10 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> {t('create.loading')}
            </div>
          ) : destinations.length === 0 ? (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-200">
              {t('create.noDestinations')}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{t('create.destination')}</span>
                  <select value={toPharmacyId} onChange={(e) => setToPharmacyId(e.target.value)} className={`${inputClass} mt-1`}>
                    {destinations.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.name}
                        {d.address ? ` (${d.address})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{t('create.notes')}</span>
                  <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder={t('create.optional')} className={`${inputClass} mt-1`} />
                </label>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('create.searchPlaceholder')}
                  className={`${inputClass} pl-9`}
                />
                {matches.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
                    {matches.map((m) => (
                      <button
                        key={m.medicine._id}
                        type="button"
                        onClick={() => addLine(m)}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 text-left cursor-pointer"
                      >
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {m.medicine.name} {m.medicine.strength}
                        </span>
                        <span className="text-slate-500">{t('create.inStock', { count: m.total })}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {lines.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">{t('create.noLines')}</p>
              ) : (
                <div className="space-y-2">
                  {lines.map((line) => {
                    const entry = stockById.get(line.medicineId);
                    const err = lineError(line);
                    return (
                      <div key={line.key} className="grid grid-cols-12 gap-2 items-start p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30">
                        <div className="col-span-12 sm:col-span-4 text-xs">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">{entry?.medicine.name}</p>
                          <p className="text-[11px] text-slate-500">{t('create.usableUnits', { count: entry?.total || 0 })}</p>
                        </div>
                        <select
                          value={line.batchId}
                          onChange={(e) => updateLine(line.key, { batchId: e.target.value })}
                          className={`${inputClass} col-span-7 sm:col-span-5`}
                        >
                          <option value="">{t('create.autoBatch')}</option>
                          {(entry?.batches || []).map((b) => (
                            <option key={b._id} value={b._id}>
                              {t('create.batchOption', { batchNo: b.batchNo, expiry: formatDate(b.expiryDate), count: b.quantity })}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={line.quantity}
                          onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                          className={`${inputClass} col-span-3 sm:col-span-2`}
                          aria-label={t('common:labels.quantity')}
                        />
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          title={t('create.remove')}
                          aria-label={t('create.remove')}
                          className="col-span-2 sm:col-span-1 p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer justify-self-end"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        {err && <p className="col-span-12 text-[11px] text-rose-600 dark:text-rose-400">{err}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            {t('common:buttons.cancel')}
          </button>
          <button
            disabled={saving || loading || !destinations.length}
            onClick={() => submit(true)}
            className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
          >
            {t('create.saveDraft')}
          </button>
          <button
            disabled={saving || loading || !destinations.length}
            onClick={() => submit(false)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            {t('create.sendNow')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateTransferModal;
