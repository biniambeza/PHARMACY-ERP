import { useState, useEffect } from 'react';
import { getSuppliers } from '../../api/supplierApi';
import { getMedicines } from '../../api/medicineApi';
import { createPurchaseOrder } from '../../api/procurementApi';

const CreatePOModal = ({ isOpen, onClose, onSuccess }) => {
  const [suppliers, setSuppliers] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [items, setItems] = useState([
    { medicineId: '', quantityOrdered: 50, unitCost: '' },
  ]);
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      const loadOptions = async () => {
        setFetchingData(true);
        try {
          const [supRes, medRes] = await Promise.all([
            getSuppliers({ status: 'active' }),
            getMedicines(),
          ]);
          setSuppliers(supRes.suppliers || []);
          setMedicines(medRes.medicines || []);
          if (supRes.suppliers?.length > 0) {
            setSupplierId(supRes.suppliers[0]._id);
          }
        } catch (err) {
          setError('Failed to load suppliers and medicines');
        } finally {
          setFetchingData(false);
        }
      };

      loadOptions();
      setError('');
      setItems([{ medicineId: '', quantityOrdered: 50, unitCost: '' }]);
      setExpectedDelivery('');
      setNotes('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddItem = () => {
    setItems((prev) => [...prev, { medicineId: '', quantityOrdered: 50, unitCost: '' }]);
  };

  const handleRemoveItem = (index) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index, field, value) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;

        const updated = { ...item, [field]: value };
        // If medicine changed, auto-suggest unitCost from medicine costPrice
        if (field === 'medicineId') {
          const selectedMed = medicines.find((m) => m._id === value);
          if (selectedMed && selectedMed.costPrice) {
            updated.unitCost = selectedMed.costPrice;
          }
        }
        return updated;
      })
    );
  };

  const totalAmount = items.reduce(
    (sum, it) => sum + (Number(it.quantityOrdered) || 0) * (Number(it.unitCost) || 0),
    0
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!supplierId) {
      return setError('Please select a supplier');
    }

    if (items.some((it) => !it.medicineId || !it.quantityOrdered || it.unitCost === '')) {
      return setError('Please fill in all medicine, quantity, and unit cost fields');
    }

    setLoading(true);

    try {
      await createPurchaseOrder({
        supplierId,
        items: items.map((it) => ({
          medicineId: it.medicineId,
          quantityOrdered: Number(it.quantityOrdered),
          unitCost: Number(it.unitCost),
        })),
        expectedDelivery: expectedDelivery || null,
        notes,
      });

      setLoading(false);
      onSuccess();
      onClose();
    } catch (err) {
      setLoading(false);
      setError(err.response?.data?.message || 'Failed to create purchase order');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-700 mb-5">
          <div>
            <h2 className="text-lg font-bold text-white">Create Purchase Order</h2>
            <p className="text-xs text-slate-400">Request pharmaceutical supplies from an approved vendor</p>
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
          {/* Supplier Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Select Supplier *</label>
            {fetchingData ? (
              <div className="text-xs text-slate-400 py-2">Loading vendors...</div>
            ) : suppliers.length === 0 ? (
              <p className="text-xs text-amber-400 py-1">
                No active suppliers found. Please register suppliers first in the Suppliers directory.
              </p>
            ) : (
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                {suppliers.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name} ({s.phone})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Items Order Builder */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-300">Medicines to Order *</label>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer"
              >
                + Add Another Medicine
              </button>
            </div>

            <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-900/80 border border-slate-700/60 rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-2 items-center text-xs"
                >
                  <div className="sm:col-span-5">
                    <select
                      value={item.medicineId}
                      onChange={(e) => handleItemChange(idx, 'medicineId', e.target.value)}
                      required
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">-- Choose Medicine --</option>
                      {medicines.map((m) => (
                        <option key={m._id} value={m._id}>
                          {m.name} {m.strength ? `(${m.strength})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-3">
                    <input
                      type="number"
                      placeholder="Qty"
                      min={1}
                      value={item.quantityOrdered}
                      onChange={(e) => handleItemChange(idx, 'quantityOrdered', e.target.value)}
                      required
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <input
                      type="number"
                      placeholder="Cost ($)"
                      step="0.01"
                      min={0}
                      value={item.unitCost}
                      onChange={(e) => handleItemChange(idx, 'unitCost', e.target.value)}
                      required
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="sm:col-span-1 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      disabled={items.length <= 1}
                      className="text-slate-500 hover:text-rose-400 disabled:opacity-20 cursor-pointer text-sm font-bold"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Expected Delivery Date</label>
              <input
                type="date"
                value={expectedDelivery}
                onChange={(e) => setExpectedDelivery(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-emerald-500 cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Order Notes / Terms</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Payment on net-30, etc."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Grand Total Bar */}
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
            <span className="text-slate-400 font-semibold">Estimated Procurement Cost:</span>
            <span className="text-emerald-400 font-bold font-mono text-base">
              ${totalAmount.toFixed(2)}
            </span>
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
              disabled={loading || suppliers.length === 0}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-md transition cursor-pointer"
            >
              {loading ? 'Submitting...' : 'Issue Purchase Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreatePOModal;
