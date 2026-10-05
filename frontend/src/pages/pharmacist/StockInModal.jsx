import { useState, useEffect } from 'react';
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
          setMedicines(res.medicines || []);
          if (res.medicines?.length > 0) {
            setFormData((prev) => ({ ...prev, medicineId: res.medicines[0]._id }));
          }
        } catch (err) {
          setError('Failed to load medicines list');
        } finally {
          setFetchingMeds(false);
        }
      };
      fetchMeds();
      setError('');
      setFormData({
        medicineId: '',
        batchNo: '',
        quantity: '',
        expiryDate: '',
        purchasePrice: '',
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await addStockBatch({
        medicineId: formData.medicineId,
        batchNo: formData.batchNo.trim(),
        quantity: Number(formData.quantity),
        expiryDate: formData.expiryDate,
        purchasePrice: formData.purchasePrice ? Number(formData.purchasePrice) : 0,
      });

      setLoading(false);
      onSuccess();
      onClose();
    } catch (err) {
      setLoading(false);
      setError(err.response?.data?.message || 'Failed to add stock batch');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-700 mb-5">
          <div>
            <h2 className="text-lg font-bold text-white">Receive Stock (Stock-In)</h2>
            <p className="text-xs text-slate-400">Record a new medicine batch with expiration date</p>
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
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Select Medicine *</label>
            {fetchingMeds ? (
              <div className="text-xs text-slate-400 py-2">Loading medicines...</div>
            ) : medicines.length === 0 ? (
              <p className="text-xs text-amber-400 py-1">
                No medicines found. Please add medicines in the Medicine Catalog first.
              </p>
            ) : (
              <select
                name="medicineId"
                value={formData.medicineId}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="">-- Choose Medicine --</option>
                {medicines.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.name} {m.strength ? `(${m.strength})` : ''} - {m.dosageForm}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Batch / Lot Number *</label>
            <input
              type="text"
              name="batchNo"
              value={formData.batchNo}
              onChange={handleChange}
              placeholder="e.g. BAT-2026-001"
              required
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Quantity Received *</label>
              <input
                type="number"
                name="quantity"
                value={formData.quantity}
                onChange={handleChange}
                placeholder="100"
                min={1}
                required
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Unit Cost Price ($)</label>
              <input
                type="number"
                step="0.01"
                name="purchasePrice"
                value={formData.purchasePrice}
                onChange={handleChange}
                placeholder="0.00"
                min={0}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Expiry Date *</label>
            <input
              type="date"
              name="expiryDate"
              value={formData.expiryDate}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500 font-mono cursor-pointer"
            />
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
              disabled={loading || medicines.length === 0}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-md transition cursor-pointer"
            >
              {loading ? 'Receiving...' : 'Add Stock Batch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StockInModal;
