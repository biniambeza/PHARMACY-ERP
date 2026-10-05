import { useState, useEffect } from 'react';
import { adjustStock } from '../../api/stockApi';

const StockAdjustModal = ({ isOpen, onClose, onSuccess, batch }) => {
  const [adjustmentType, setAdjustmentType] = useState('damaged');
  const [reduceQty, setReduceQty] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setAdjustmentType('damaged');
      setReduceQty('');
      setError('');
    }
  }, [isOpen, batch]);

  if (!isOpen || !batch) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const qty = Number(reduceQty);
    if (!qty || qty <= 0) {
      return setError('Please enter a valid quantity greater than 0');
    }

    if (qty > batch.quantity) {
      return setError(`Cannot reduce more than current quantity (${batch.quantity})`);
    }

    setLoading(true);

    try {
      await adjustStock(batch._id, {
        adjustmentType,
        reduceQty: qty,
      });

      setLoading(false);
      onSuccess();
      onClose();
    } catch (err) {
      setLoading(false);
      setError(err.response?.data?.message || 'Failed to adjust stock');
    }
  };

  const parsedQty = Number(reduceQty) || 0;
  const remainingQty = Math.max(0, batch.quantity - parsedQty);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-slate-700 mb-5">
          <div>
            <h2 className="text-lg font-bold text-white">Adjust Stock</h2>
            <p className="text-xs text-slate-400">Record stock reduction for write-off or discrepancy</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg font-bold p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Selected Batch Details */}
        <div className="bg-slate-900/70 border border-slate-700/60 rounded-xl p-3.5 mb-4 text-xs space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Medicine:</span>
            <span className="font-semibold text-white">
              {batch.medicineId?.name} {batch.medicineId?.strength ? `(${batch.medicineId.strength})` : ''}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Batch Number:</span>
            <span className="font-mono text-emerald-400">{batch.batchNo}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Current In Stock:</span>
            <span className="font-bold text-white font-mono">{batch.quantity} units</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Expiry Date:</span>
            <span className="text-slate-300 font-mono">
              {new Date(batch.expiryDate).toLocaleDateString()}
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Adjustment Reason *</label>
            <select
              value={adjustmentType}
              onChange={(e) => setAdjustmentType(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
            >
              <option value="damaged">Damaged / Broken Units</option>
              <option value="expired">Expired Write-off</option>
              <option value="correction">Inventory Discrepancy / Recount</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Quantity to Deduct * <span className="text-slate-500">(Max: {batch.quantity})</span>
            </label>
            <input
              type="number"
              value={reduceQty}
              onChange={(e) => setReduceQty(e.target.value)}
              placeholder="e.g. 5"
              min={1}
              max={batch.quantity}
              required
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
            />
          </div>

          {/* Dynamic Result Indicator */}
          {reduceQty && parsedQty > 0 && (
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex justify-between">
              <span>Remaining After Adjustment:</span>
              <span className="font-bold font-mono">{remainingQty} units</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-md transition cursor-pointer"
            >
              {loading ? 'Adjusting...' : 'Confirm Adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StockAdjustModal;
