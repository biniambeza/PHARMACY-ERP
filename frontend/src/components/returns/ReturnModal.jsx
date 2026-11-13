import { useEffect, useMemo, useState } from 'react';
import { Undo2, X, AlertCircle, Loader2 } from 'lucide-react';
import { createReturn, getReturns } from '../../api/returnApi';
import { formatMoney } from '../../utils/format';

const REFUND_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'store_credit', label: 'Store credit' },
];

const REASONS = ['Customer changed mind', 'Wrong item dispensed', 'Damaged / defective', 'Expired product', 'Adverse reaction'];

const inputCls =
  'w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition';

// Lets the user pick quantities per sale line, the disposition, a reason and a refund method.
const ReturnModal = ({ sale, onClose, onDone }) => {
  const [returnedByItem, setReturnedByItem] = useState({});
  const [lines, setLines] = useState({});
  const [reason, setReason] = useState(REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [refundMethod, setRefundMethod] = useState('cash');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getReturns({ saleId: sale._id, limit: 100 })
      .then((data) => {
        if (cancelled) return;
        const map = {};
        (data.returns || []).forEach((r) =>
          r.items.forEach((it) => {
            map[it.saleItemId] = (map[it.saleItemId] || 0) + it.quantity;
          })
        );
        setReturnedByItem(map);
      })
      .catch(() => !cancelled && setError('Could not load previous returns for this sale'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [sale._id]);

  const factor = sale.subtotal > 0 ? sale.grandTotal / sale.subtotal : 0;

  const rows = useMemo(
    () =>
      (sale.items || []).map((it) => {
        const remaining = it.quantity - (returnedByItem[it._id] || 0);
        const line = lines[it._id] || { quantity: 0, disposition: 'restock' };
        return { item: it, remaining, ...line };
      }),
    [sale.items, returnedByItem, lines]
  );

  const estimate = rows.reduce((sum, r) => sum + r.quantity * r.item.unitPrice * factor, 0);
  const selected = rows.filter((r) => r.quantity > 0);

  const setLine = (id, patch) =>
    setLines((prev) => ({ ...prev, [id]: { quantity: 0, disposition: 'restock', ...prev[id], ...patch } }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const finalReason = reason === 'other' ? customReason.trim() : reason;
    if (!finalReason) return setError('Please give a reason');
    if (selected.length === 0) return setError('Select at least one item quantity to return');
    setSubmitting(true);
    try {
      const res = await createReturn({
        saleId: sale._id,
        reason: finalReason,
        refundMethod,
        items: selected.map((r) => ({ saleItemId: r.item._id, quantity: r.quantity, disposition: r.disposition })),
      });
      onDone?.(res);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to process the return');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs">
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-[#161c26] border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-200/80 dark:border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Undo2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Return items</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{sale.invoiceNumber}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
            Loading sale lines...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800 text-[10px]">
                <tr>
                  <th className="py-2 pr-2">Item / batch</th>
                  <th className="py-2 px-2 text-right">Sold</th>
                  <th className="py-2 px-2 text-right">Left</th>
                  <th className="py-2 px-2">Return qty</th>
                  <th className="py-2 pl-2">Disposition</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {rows.map((r) => (
                  <tr key={r.item._id}>
                    <td className="py-2 pr-2">
                      <span className="font-semibold text-slate-900 dark:text-white block">{r.item.name}</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        {r.item.batchNo} · {formatMoney(r.item.unitPrice)}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-slate-700 dark:text-slate-300">{r.item.quantity}</td>
                    <td className="py-2 px-2 text-right font-mono text-slate-700 dark:text-slate-300">{r.remaining}</td>
                    <td className="py-2 px-2 w-24">
                      <input
                        type="number"
                        min={0}
                        max={r.remaining}
                        step={1}
                        disabled={r.remaining <= 0}
                        value={r.quantity}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(r.remaining, parseInt(e.target.value, 10) || 0));
                          setLine(r.item._id, { quantity: v });
                        }}
                        className={`${inputCls} disabled:opacity-50`}
                      />
                    </td>
                    <td className="py-2 pl-2 w-32">
                      <select
                        value={r.disposition}
                        disabled={r.remaining <= 0}
                        onChange={(e) => setLine(r.item._id, { disposition: e.target.value })}
                        className={`${inputCls} disabled:opacity-50`}
                      >
                        <option value="restock">Restock</option>
                        <option value="discard">Discard</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 space-y-1">
            <span>Reason</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls}>
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              <option value="other">Other...</option>
            </select>
          </label>
          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 space-y-1">
            <span>Refund method</span>
            <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)} className={inputCls}>
              {REFUND_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          {reason === 'other' && (
            <label className="sm:col-span-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300 space-y-1">
              <span>Describe the reason</span>
              <input
                type="text"
                maxLength={500}
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className={inputCls}
              />
            </label>
          )}
        </div>

        <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
          Restocked items go back into the same batch. Expired batches and discarded items are not restocked.
          {sale.customerId && sale.balanceDue > 0 && (
            <> For this credit sale, the refund first reduces what the customer still owes; only the rest is paid out via the refund method.</>
          )}
        </p>

        <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-slate-200/80 dark:border-slate-800">
          <div className="text-xs text-slate-600 dark:text-slate-300">
            Estimated refund:{' '}
            <span className="font-bold font-mono text-slate-900 dark:text-white">{formatMoney(estimate)}</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || loading || selected.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
              <span>Process return</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default ReturnModal;
