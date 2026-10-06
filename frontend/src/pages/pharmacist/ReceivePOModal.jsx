import { useState, useEffect } from 'react';
import { CheckCircle, Truck, Calendar, Hash, X, AlertCircle, Sparkles, PackageCheck } from 'lucide-react';
import { receivePurchaseOrder } from '../../api/procurementApi';

const ReceivePOModal = ({ isOpen, onClose, onSuccess, order }) => {
  const [batchDetails, setBatchDetails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (order && order.items) {
      setBatchDetails(
        order.items.map((it, idx) => ({
          medicineId: it.medicineId?._id || it.medicineId,
          name: it.name || it.medicineId?.name || `Item #${idx + 1}`,
          quantityOrdered: it.quantityOrdered,
          batchNo: `LOT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
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

  const handleAutoFillExpiry = () => {
    // Fill default 2-year forward expiry date for convenience
    const twoYearsLater = new Date();
    twoYearsLater.setFullYear(twoYearsLater.getFullYear() + 2);
    const dateStr = twoYearsLater.toISOString().split('T')[0];

    setBatchDetails((prev) =>
      prev.map((item) => ({
        ...item,
        expiryDate: item.expiryDate || dateStr,
      }))
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const missing = batchDetails.find((b) => !b.batchNo?.trim() || !b.expiryDate);
    if (missing) {
      return setError(`Please provide both lot batch number and expiration date for "${missing.name}".`);
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
      setError(err.response?.data?.message || 'Failed to receive purchase order delivery');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-[#161c26] border border-slate-200/90 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 sm:p-7 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800/80 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200/80 dark:border-teal-800/60 flex items-center justify-center text-teal-600 dark:text-teal-400 shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                  Receive Inbound Delivery
                </h2>
                <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                  {order.poNumber}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Assign manufacturer lot numbers and expiry dates to deposit stock into active inventory
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
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        {/* Supplier & Order Details Banner */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-700/60 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Supplier / Vendor:</span>
            <span className="font-bold text-slate-900 dark:text-white">
              {order.supplierId?.name || 'Authorized Pharmaceutical Distributor'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleAutoFillExpiry}
              className="text-[11px] text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" /> Auto-Set Default 2Y Expiry
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Inbound Line Items & Batch Verification ({batchDetails.length})
            </label>

            {batchDetails.map((item, idx) => (
              <div
                key={idx}
                className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-700/60 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PackageCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    <span className="font-bold text-xs text-slate-900 dark:text-white">
                      {item.name}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-semibold text-slate-600 dark:text-slate-300">
                    Units Received: <strong>{item.quantityOrdered}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Lot number */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Batch / Lot Number <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Hash className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                      <input
                        type="text"
                        value={item.batchNo}
                        onChange={(e) => handleBatchChange(idx, 'batchNo', e.target.value)}
                        placeholder="LOT-2026-XXXX"
                        required
                        className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white font-mono placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition"
                      />
                    </div>
                  </div>

                  {/* Expiry date */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Expiry Date (FEFO) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                      <input
                        type="date"
                        value={item.expiryDate}
                        onChange={(e) => handleBatchChange(idx, 'expiryDate', e.target.value)}
                        required
                        className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
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
              disabled={loading}
              className="px-5 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-sm transition flex items-center gap-2 cursor-pointer"
            >
              {loading ? (
                <span>Depositing to Stock...</span>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Receive & Add to Inventory</span>
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
