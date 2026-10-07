import { useState, useEffect } from 'react';
import {
  ShoppingCart,
  Plus,
  Trash2,
  Building2,
  Calendar,
  X,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
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
          const medList = medRes.medicines || [];
          setMedicines(medList);

          if (supRes.suppliers?.length > 0) {
            setSupplierId(supRes.suppliers[0]._id);
          }
          if (medList.length > 0) {
            setItems([
              {
                medicineId: medList[0]._id,
                quantityOrdered: 50,
                unitCost: medList[0].costPrice || '',
              },
            ]);
          }
        } catch (err) {
          setError('Failed to load active suppliers and medication catalog.');
        } finally {
          setFetchingData(false);
        }
      };

      loadOptions();
      setError('');
      setExpectedDelivery('');
      setNotes('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddItem = () => {
    const defaultMed = medicines[0];
    setItems((prev) => [
      ...prev,
      {
        medicineId: defaultMed ? defaultMed._id : '',
        quantityOrdered: 50,
        unitCost: defaultMed?.costPrice || '',
      },
    ]);
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

  const calculatedTotal = items.reduce((sum, it) => {
    const q = Number(it.quantityOrdered) || 0;
    const c = Number(it.unitCost) || 0;
    return sum + q * c;
  }, 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!supplierId) {
      return setError('Please select a verified vendor/supplier.');
    }

    if (items.length === 0) {
      return setError('Purchase order must contain at least one item line.');
    }

    const hasInvalidItem = items.some(
      (it) => !it.medicineId || Number(it.quantityOrdered) <= 0 || Number(it.unitCost) <= 0
    );
    if (hasInvalidItem) {
      return setError('Please check all product line quantities and unit purchase costs.');
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
        expectedDelivery: expectedDelivery || undefined,
        notes: notes.trim() || undefined,
      });

      setLoading(false);
      onSuccess();
      onClose();
    } catch (err) {
      setLoading(false);
      setError(err.response?.data?.message || 'Failed to generate purchase order');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-[#161c26] border border-slate-200/90 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 sm:p-7 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800/80 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                Draft Purchase Order
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Initiate supplier procurement requisition for pharmaceutical inventory replenishment
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
          {/* Supplier & Delivery */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Select Pharmaceutical Vendor <span className="text-rose-500">*</span>
              </label>
              {fetchingData ? (
                <div className="py-2 text-xs text-slate-400">Loading vendors...</div>
              ) : suppliers.length === 0 ? (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-xl text-xs text-amber-700 dark:text-amber-300">
                  No active suppliers available. Add suppliers first.
                </div>
              ) : (
                <div className="relative">
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    required
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition cursor-pointer"
                  >
                    {suppliers.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name} {s.contactPerson ? `(${s.contactPerson})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Expected Delivery Date
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="date"
                  value={expectedDelivery}
                  onChange={(e) => setExpectedDelivery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Requisition Items Section */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Order Line Items <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Product Line
              </button>
            </div>

            <div className="space-y-2.5">
              {items.map((item, idx) => {
                const lineTotal = (Number(item.quantityOrdered) || 0) * (Number(item.unitCost) || 0);

                return (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-700/60 flex flex-col sm:flex-row items-center gap-2.5"
                  >
                    {/* Medicine selection */}
                    <div className="flex-1 w-full sm:w-auto">
                      <select
                        value={item.medicineId}
                        onChange={(e) => handleItemChange(idx, 'medicineId', e.target.value)}
                        required
                        className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition cursor-pointer"
                      >
                        {medicines.map((m) => (
                          <option key={m._id} value={m._id}>
                            {m.name} ({m.dosageForm || 'Unit'})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Quantity */}
                    <div className="w-full sm:w-28">
                      <input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={item.quantityOrdered}
                        onChange={(e) => handleItemChange(idx, 'quantityOrdered', e.target.value)}
                        required
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white font-mono placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition text-center"
                      />
                    </div>

                    {/* Unit Cost */}
                    <div className="w-full sm:w-32 relative">
                      <span className="absolute left-2.5 top-1.5 text-xs text-slate-400 font-mono">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="Cost"
                        value={item.unitCost}
                        onChange={(e) => handleItemChange(idx, 'unitCost', e.target.value)}
                        required
                        className="w-full pl-6 pr-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white font-mono placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                      />
                    </div>

                    {/* Subtotal */}
                    <div className="w-full sm:w-28 text-right sm:text-right">
                      <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                        ${lineTotal.toFixed(2)}
                      </span>
                    </div>

                    {/* Delete line button */}
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      disabled={items.length <= 1}
                      title="Remove product"
                      className="p-1.5 text-slate-400 hover:text-rose-500 disabled:opacity-30 disabled:cursor-not-allowed transition rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Procurement Notes & Delivery Terms
            </label>
            <textarea
              rows="2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Standard cold-chain required, net 30 days invoice payment..."
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
            />
          </div>

          {/* Requisition Total Summary Banner */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-300 font-medium">
              Estimated Order Total:
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 font-mono">
                ({items.length} product lines)
              </span>
              <span className="font-mono font-bold text-base text-emerald-600 dark:text-emerald-400">
                ${calculatedTotal.toFixed(2)}
              </span>
            </div>
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
              disabled={loading || suppliers.length === 0 || medicines.length === 0}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-sm transition flex items-center gap-2 cursor-pointer"
            >
              {loading ? (
                <span>Generating Order...</span>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Issue Purchase Order</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreatePOModal;
