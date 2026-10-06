import { useState, useEffect } from 'react';
import { SlidersHorizontal, X, AlertTriangle, ArrowDown, CheckCircle } from 'lucide-react';
import { adjustStock } from '../../api/stockApi';

const ADJUSTMENT_REASONS = [
  { value: 'damaged', label: 'Damaged / Broken Packaging', desc: 'Physically compromised goods' },
  { value: 'expired', label: 'Expired on Shelf', desc: 'Past manufacturer expiration date' },
  { value: 'lost', label: 'Shrinkage / Unaccounted Loss', desc: 'Inventory discrepancy during cycle count' },
  { value: 'audit', label: 'Cycle Count Audit Correction', desc: 'Stock reconciliation adjustment' },
  { value: 'dispensing_loss', label: 'Compounding / Dispensing Waste', desc: 'Lost during reconstitution or measurement' },
];

const StockAdjustModal = ({ isOpen, onClose, onSuccess, batch }) => {
  const [adjustmentType, setAdjustmentType] = useState('damaged');
  const [reduceQty, setReduceQty] = useState('');
  const [reasonNote, setReasonNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setAdjustmentType('damaged');
      setReduceQty('');
      setReasonNote('');
      setError('');
    }
  }, [isOpen, batch]);

  if (!isOpen || !batch) return null;

  const currentQuantity = Number(batch.quantity) || 0;
  const parsedQty = parseInt(reduceQty, 10) || 0;
  const remainingQty = Math.max(0, currentQuantity - parsedQty);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!parsedQty || parsedQty <= 0) {
      return setError('Please enter a valid deduction quantity greater than 0.');
    }

    if (parsedQty > currentQuantity) {
      return setError(`Cannot deduct ${parsedQty} units. Batch only contains ${currentQuantity} available units.`);
    }

    setLoading(true);

    try {
      await adjustStock(batch._id, {
        adjustmentType,
        reduceQty: parsedQty,
        notes: reasonNote.trim(),
      });

      setLoading(false);
      onSuccess();
      onClose();
    } catch (err) {
      setLoading(false);
      setError(err.response?.data?.message || 'Failed to adjust inventory batch');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-[#161c26] border border-slate-200/90 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 sm:p-7 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800/80 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                Adjust Inventory Batch
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Record shrinkage, damages, or reconciliation write-offs
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 mb-5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        {/* Selected Batch Summary Box */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-700/60 mb-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-900 dark:text-white">
              {batch.medicineId?.name || 'Selected Item'}
            </span>
            <span className="font-mono text-teal-600 dark:text-teal-400 font-bold">
              {batch.batchNo}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Dosage: {batch.medicineId?.dosageForm || 'Unit'}</span>
            <span>
              Expires:{' '}
              {batch.expiryDate
                ? new Date(batch.expiryDate).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })
                : 'N/A'}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Reason Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Reason for Adjustment <span className="text-rose-500">*</span>
            </label>
            <select
              value={adjustmentType}
              onChange={(e) => setAdjustmentType(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition cursor-pointer"
            >
              {ADJUSTMENT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Quantity to Deduct */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Quantity to Deduct <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <ArrowDown className="w-4 h-4 text-rose-500 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="number"
                min="1"
                max={currentQuantity}
                value={reduceQty}
                onChange={(e) => setReduceQty(e.target.value)}
                placeholder={`1 to ${currentQuantity}`}
                required
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white font-mono placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition"
              />
            </div>
          </div>

          {/* Stock Impact Visualizer */}
          <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
            <div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Current Qty</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200 text-sm">
                {currentQuantity}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Deduction</span>
              <span className="font-mono font-bold text-rose-500 text-sm">
                -{parsedQty}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block">New Balance</span>
              <span className="font-mono font-bold text-teal-600 dark:text-teal-400 text-sm">
                {remainingQty}
              </span>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || parsedQty <= 0 || parsedQty > currentQuantity}
              className="px-5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-sm transition flex items-center gap-2 cursor-pointer"
            >
              {loading ? (
                <span>Writing off...</span>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Confirm Write-Off</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StockAdjustModal;
