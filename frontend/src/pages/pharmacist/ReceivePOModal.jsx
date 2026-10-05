import { useState, useEffect } from 'react';
import { receivePurchaseOrder } from '../../api/procurementApi';

const ReceivePOModal = ({ isOpen, onClose, onSuccess, order }) => {
  const [batchDetails, setBatchDetails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (order && order.items) {
      setBatchDetails(
        order.items.map((it) => ({
          medicineId: it.medicineId?._id || it.medicineId,
          name: it.name,
          quantityOrdered: it.quantityOrdered,
          batchNo: '',
          expiryDate: '',
        }))
      );
      setError('');
    }
  }, [order, isOpen]);

  if (!isOpen || !order) return null;

  const handleBatchChange = (index, field, value) => {
    setBatchDetails((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const missing = batchDetails.find((b) => !b.batchNo?.trim() || !b.expiryDate);
    if (missing) {
      return setError(`Please provide batch number and expiry date for "${missing.name}"`);
    }

    setLoading(true);

    try {
      await receivePurchaseOrder(
        order._id,
        batchDetails.map((b) => ({
          medicineId: b.medicineId,
          batchNo: b.batchNo.trim(),
          expiryDate: b.expiryDate,
        }))
      );

      setLoading(false);
      onSuccess();
      onClose();
    } catch (err) {
      setLoading(false);
      setError(err.response?.data?.message || 'Failed to receive purchase order');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-700 mb-5">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 mb-1">
              PO: {order.poNumber}
            </div>
            <h2 className="text-lg font-bold text-white">Receive Stock Delivery</h2>
            <p className="text-xs text-slate-400">
              Assign manufacturer batch numbers and expiration dates to convert order into live stock
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg font-bold p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            {batchDetails.map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-slate-900/80 border border-slate-700/60 rounded-xl space-y-2 text-xs"
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-white text-sm">{item.name}</span>
                  <span className="font-mono text-emerald-400 font-semibold">
                    Qty: {item.quantityOrdered} units
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Batch / Lot # *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. LOT-2026-X"
                      value={item.batchNo}
                      onChange={(e) => handleBatchChange(idx, 'batchNo', e.target.value)}
                      required
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Expiry Date *
                    </label>
                    <input
                      type="date"
                      value={item.expiryDate}
                      onChange={(e) => handleBatchChange(idx, 'expiryDate', e.target.value)}
                      required
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-emerald-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-[11px] text-slate-400">
            <span className="font-semibold text-emerald-400">Inventory Notice: </span>
            Submitting this delivery will automatically create active stock batches in the FEFO inventory queue.
          </div>

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
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-md transition cursor-pointer"
            >
              {loading ? 'Receiving Stock...' : 'Confirm Delivery & Add Stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ReceivePOModal;
