import { useState, useEffect } from 'react';
import { PackagePlus, X, Calendar, DollarSign, Layers, Hash, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';
import { getMedicines } from '../../api/medicineApi';
import { addStockBatch } from '../../api/stockApi';

const StockInModal = ({ isOpen, onClose, onSuccess }) => {
  const [medicines, setMedicines] = useState([]);
  const [formData, setFormData] = useState({
    medicineId: '',
    batchNo: '',
    quantity: '',
    expiryDate: '',
    purchasePrice: '',
  });
  const [loading, setLoading] = useState(false);
  const [fetchingMeds, setFetchingMeds] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      const fetchMeds = async () => {
        setFetchingMeds(true);
        try {
          const res = await getMedicines();
          const medList = res.medicines || [];
          setMedicines(medList);
          if (medList.length > 0) {
            setFormData((prev) => ({
              ...prev,
              medicineId: medList[0]._id,
              purchasePrice: medList[0].costPrice || '',
            }));
          }
        } catch (err) {
          setError('Failed to load medicines catalog');
        } finally {
          setFetchingMeds(false);
        }
      };
      fetchMeds();
      setError('');
      setFormData({
        medicineId: '',
        batchNo: `LOT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        quantity: '',
        expiryDate: '',
        purchasePrice: '',
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const updated = { ...prev, [name]: value };
      if (name === 'medicineId') {
        const selected = medicines.find((m) => m._id === value);
        if (selected && selected.costPrice) {
          updated.purchasePrice = selected.costPrice;
        }
      }
      return updated;
    });
  };

  const handleGenerateBatchNo = () => {
    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    setFormData((prev) => ({
      ...prev,
      batchNo: `LOT-${new Date().getFullYear()}-${randomSuffix}`,
    }));
  };

  const qtyNum = parseInt(formData.quantity, 10) || 0;
  const costNum = parseFloat(formData.purchasePrice) || 0;
  const totalValuation = qtyNum * costNum;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.medicineId) {
      return setError('Please select a medication formulation.');
    }
    if (!formData.batchNo.trim()) {
      return setError('Please specify a batch/lot identification number.');
    }
    if (qtyNum <= 0) {
      return setError('Initial stock quantity must be at least 1.');
    }
    if (!formData.expiryDate) {
      return setError('Expiry date is mandatory for FEFO inventory compliance.');
    }

    setLoading(true);

    try {
      await addStockBatch({
        medicineId: formData.medicineId,
        batchNo: formData.batchNo.trim(),
        quantity: qtyNum,
        expiryDate: formData.expiryDate,
        purchasePrice: costNum,
      });

      setLoading(false);
      onSuccess();
      onClose();
    } catch (err) {
      setLoading(false);
      setError(err.response?.data?.message || 'Failed to record stock entry');
    }
  };

  const selectedMed = medicines.find((m) => m._id === formData.medicineId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-[#161c26] border border-slate-200/90 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 sm:p-7 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800/80 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200/80 dark:border-teal-800/60 flex items-center justify-center text-teal-600 dark:text-teal-400 shrink-0">
              <PackagePlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                Receive Direct Stock In
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Register batch lot numbers with expiration tracking under FEFO protocol
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

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Medicine Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Select Medicine Item <span className="text-rose-500">*</span>
            </label>
            {fetchingMeds ? (
              <div className="py-2 text-xs text-slate-400">Loading catalog...</div>
            ) : medicines.length === 0 ? (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-xl text-xs text-amber-700 dark:text-amber-300">
                No medicines found in catalog. Please register a product first.
              </div>
            ) : (
              <select
                name="medicineId"
                value={formData.medicineId}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition cursor-pointer"
              >
                {medicines.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.name} {m.dosageForm ? `(${m.dosageForm})` : ''} - Retail: ${Number(m.price || 0).toFixed(2)}
                  </option>
                ))}
              </select>
            )}
            {selectedMed && (
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1 px-1">
                <span>Generic: {selectedMed.genericName || 'Standard formulation'}</span>
                <span>Category: {selectedMed.category}</span>
              </div>
            )}
          </div>

          {/* Batch Number */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Batch / Lot Number <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleGenerateBatchNo}
                className="text-[10px] text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
              >
                <Sparkles className="w-3 h-3" /> Auto-Generate
              </button>
            </div>
            <div className="relative">
              <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                name="batchNo"
                value={formData.batchNo}
                onChange={handleChange}
                placeholder="e.g. LOT-2026-4892"
                required
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white font-mono placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Units Received */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Quantity Received (Units) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Layers className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="number"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleChange}
                  placeholder="e.g. 100"
                  min="1"
                  required
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white font-mono placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition"
                />
              </div>
            </div>

            {/* Expiration Date */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Expiry Date <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="date"
                  name="expiryDate"
                  value={formData.expiryDate}
                  onChange={handleChange}
                  required
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Unit Cost Price */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Purchase Cost Per Unit (Optional)
            </label>
            <div className="relative">
              <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="number"
                step="0.01"
                min="0"
                name="purchasePrice"
                value={formData.purchasePrice}
                onChange={handleChange}
                placeholder="0.00"
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white font-mono placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition"
              />
            </div>
          </div>

          {/* Valuation calculation preview */}
          {qtyNum > 0 && costNum > 0 && (
            <div className="p-3 bg-teal-50/60 dark:bg-teal-950/30 rounded-xl border border-teal-200/80 dark:border-teal-900/40 flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-300">Total Batch Valuation:</span>
              <span className="font-mono font-bold text-teal-700 dark:text-teal-300 text-sm">
                ${totalValuation.toFixed(2)}
              </span>
            </div>
          )}

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
              disabled={loading || medicines.length === 0}
              className="px-5 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-sm transition flex items-center gap-2 cursor-pointer"
            >
              {loading ? (
                <span>Registering Batch...</span>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Confirm Stock In</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StockInModal;
