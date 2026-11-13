import { useState, useEffect } from 'react';
import {
  CheckCircle,
  Truck,
  Calendar,
  Hash,
  X,
  AlertCircle,
  Sparkles,
  PackageCheck,
  Plus,
  Trash2,
  FileText,
  Gift,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { receivePurchaseOrder } from '../../api/procurementApi';
import { formatMoney } from '../../utils/format';

const inputCls =
  'w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition';

const labelCls = 'block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1';

const newLotNo = () => `LOT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

const newBatch = (quantity = 0) => ({
  batchNo: newLotNo(),
  expiryDate: '',
  quantity,
  bonusQuantity: 0,
});

const ReceivePOModal = ({ isOpen, onClose, onSuccess, order }) => {
  const { t } = useTranslation('procurement');
  const [lines, setLines] = useState([]);
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [supplierInvoiceDate, setSupplierInvoiceDate] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (order && order.items) {
      setLines(
        order.items.map((it, idx) => {
          const received = it.quantityReceived || 0;
          const outstanding = Math.max(0, it.quantityOrdered - received);
          return {
            medicineId: it.medicineId?._id || it.medicineId,
            name: it.name || it.medicineId?.name || '',
            itemNo: idx + 1,
            quantityOrdered: it.quantityOrdered,
            quantityReceived: received,
            outstanding,
            unitCost: it.unitCost,
            batches: outstanding > 0 ? [newBatch(outstanding)] : [],
          };
        })
      );
      setSupplierInvoiceNo('');
      setSupplierInvoiceDate('');
      setNotes('');
      setError('');
    }
  }, [order, isOpen]);

  if (!isOpen || !order) return null;

  const updateBatch = (lineIdx, batchIdx, field, value) => {
    setLines((prev) =>
      prev.map((l, i) =>
        i === lineIdx
          ? { ...l, batches: l.batches.map((b, j) => (j === batchIdx ? { ...b, [field]: value } : b)) }
          : l
      )
    );
  };

  const addBatch = (lineIdx) => {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== lineIdx) return l;
        const entered = l.batches.reduce((s, b) => s + (Number(b.quantity) || 0), 0);
        return { ...l, batches: [...l.batches, newBatch(Math.max(0, l.outstanding - entered))] };
      })
    );
  };

  const removeBatch = (lineIdx, batchIdx) => {
    setLines((prev) =>
      prev.map((l, i) => (i === lineIdx ? { ...l, batches: l.batches.filter((_, j) => j !== batchIdx) } : l))
    );
  };

  const handleAutoFillExpiry = () => {
    const twoYearsLater = new Date();
    twoYearsLater.setFullYear(twoYearsLater.getFullYear() + 2);
    const dateStr = twoYearsLater.toISOString().split('T')[0];
    setLines((prev) =>
      prev.map((l) => ({
        ...l,
        batches: l.batches.map((b) => ({ ...b, expiryDate: b.expiryDate || dateStr })),
      }))
    );
  };

  const lineName = (l) => l.name || t('receive.itemN', { n: l.itemNo });
  const lineEntered = (l) => l.batches.reduce((s, b) => s + (Number(b.quantity) || 0), 0);
  const receiptTotal = lines.reduce(
    (sum, l) => sum + l.batches.reduce((s, b) => s + (Number(b.quantity) || 0) * (Number(l.unitCost) || 0), 0),
    0
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const payloadLines = [];
    for (const l of lines) {
      if (lineEntered(l) > l.outstanding) {
        return setError(t('receive.errors.overOutstanding', { name: lineName(l), outstanding: l.outstanding }));
      }
      for (const b of l.batches) {
        const qty = Number(b.quantity) || 0;
        const bonus = Number(b.bonusQuantity) || 0;
        if (qty < 0 || bonus < 0 || !Number.isInteger(qty) || !Number.isInteger(bonus)) {
          return setError(t('receive.errors.wholeNumbers', { name: lineName(l) }));
        }
        if (qty + bonus === 0) continue; // empty batch row is ignored
        if (!b.batchNo?.trim() || !b.expiryDate) {
          return setError(t('receive.errors.lotAndExpiry', { name: lineName(l) }));
        }
        payloadLines.push({
          medicineId: l.medicineId,
          batchNo: b.batchNo.trim(),
          expiryDate: b.expiryDate,
          quantity: qty,
          bonusQuantity: bonus,
        });
      }
    }

    if (payloadLines.length === 0) {
      return setError(t('receive.errors.nothingEntered'));
    }

    setLoading(true);
    try {
      await receivePurchaseOrder(order._id, {
        lines: payloadLines,
        supplierInvoiceNo: supplierInvoiceNo.trim() || undefined,
        supplierInvoiceDate: supplierInvoiceDate || undefined,
        notes: notes.trim() || undefined,
      });
      setLoading(false);
      onSuccess();
      onClose();
    } catch (err) {
      setLoading(false);
      setError(err.response?.data?.message || t('receive.errors.receiveFailed'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-[#161c26] border border-slate-200/90 dark:border-slate-800 rounded-2xl max-w-3xl w-full p-6 sm:p-7 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800/80 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                  {t('receive.title')}
                </h2>
                <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                  {order.poNumber}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('receive.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common:buttons.close')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 mb-5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Supplier & invoice */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-700/60 space-y-3 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[11px]">{t('receive.supplierLabel')}</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {order.supplierId?.name || t('receive.supplierFallback')}
                </span>
              </div>
              <button
                type="button"
                onClick={handleAutoFillExpiry}
                className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-medium cursor-pointer self-start"
              >
                <Sparkles className="w-3.5 h-3.5" /> {t('receive.fillExpiry')}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>{t('receive.invoiceNo')}</label>
                <div className="relative">
                  <FileText className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    value={supplierInvoiceNo}
                    onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                    placeholder={t('receive.optional')}
                    maxLength={100}
                    className={`${inputCls} pl-8 font-mono`}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>{t('receive.invoiceDate')}</label>
                <input
                  type="date"
                  value={supplierInvoiceDate}
                  onChange={(e) => setSupplierInvoiceDate(e.target.value)}
                  className={`${inputCls} cursor-pointer`}
                />
              </div>
              <div>
                <label className={labelCls}>{t('receive.notes')}</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('receive.optional')}
                  maxLength={500}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              {t('receive.items', { count: lines.length })}
            </label>

            {lines.map((l, lineIdx) => {
              const entered = lineEntered(l);
              const over = entered > l.outstanding;
              return (
                <div
                  key={l.medicineId || lineIdx}
                  className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-700/60 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <PackageCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="font-bold text-xs text-slate-900 dark:text-white">{lineName(l)}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-mono text-slate-600 dark:text-slate-300">
                      <span>{t('receive.ordered')} <strong>{l.quantityOrdered}</strong></span>
                      <span>{t('receive.received')} <strong>{l.quantityReceived}</strong></span>
                      <span className={over ? 'text-rose-600 dark:text-rose-400' : ''}>
                        {t('receive.now')} <strong>{entered}</strong> / {l.outstanding}
                      </span>
                    </div>
                  </div>

                  {l.outstanding === 0 && l.batches.length === 0 && (
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400">{t('receive.fullyReceived')}</p>
                  )}

                  {l.batches.map((b, batchIdx) => (
                    <div key={batchIdx} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end">
                      <div className="col-span-2 sm:col-span-4">
                        <label className={labelCls}>{t('receive.lotNumber')}</label>
                        <div className="relative">
                          <Hash className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                          <input
                            type="text"
                            value={b.batchNo}
                            onChange={(e) => updateBatch(lineIdx, batchIdx, 'batchNo', e.target.value)}
                            placeholder="LOT-2026-XXXX"
                            className={`${inputCls} pl-8 font-mono`}
                          />
                        </div>
                      </div>
                      <div className="col-span-2 sm:col-span-3">
                        <label className={labelCls}>{t('receive.expiryDate')}</label>
                        <div className="relative">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                          <input
                            type="date"
                            value={b.expiryDate}
                            onChange={(e) => updateBatch(lineIdx, batchIdx, 'expiryDate', e.target.value)}
                            className={`${inputCls} pl-8 cursor-pointer`}
                          />
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelCls}>{t('receive.receivedQty')}</label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={b.quantity}
                          onChange={(e) => updateBatch(lineIdx, batchIdx, 'quantity', e.target.value)}
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={`${labelCls} flex items-center gap-1`}>
                          <Gift className="w-3 h-3" /> {t('receive.bonus')}
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={b.bonusQuantity}
                          onChange={(e) => updateBatch(lineIdx, batchIdx, 'bonusQuantity', e.target.value)}
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeBatch(lineIdx, batchIdx)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition cursor-pointer"
                          title={t('receive.removeLot')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => addBatch(lineIdx)}
                    className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> {l.outstanding > 0 ? t('receive.addLot') : t('receive.addBonusLot')}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-300 font-medium">{t('receive.receiptCost')}</span>
            <span className="font-mono font-bold text-base text-emerald-600 dark:text-emerald-400">
              {formatMoney(receiptTotal)}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              {t('common:buttons.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-sm transition flex items-center gap-2 cursor-pointer"
            >
              {loading ? (
                <span>{t('receive.saving')}</span>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>{t('receive.submit')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ReceivePOModal;
