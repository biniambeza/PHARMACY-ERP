import { useState, useEffect } from 'react';
import { Pill, X, AlertCircle, CheckCircle, ShieldAlert, ShieldCheck, Wand2, Lock } from 'lucide-react';
import { createMedicine, updateMedicine, generateBarcode } from '../../api/medicineApi';
import { useAuth } from '../../context/AuthContext';
import PackUnitsEditor from '../../components/catalog/PackUnitsEditor';
import MarginBadge from '../../components/catalog/MarginBadge';
import { marginWarningFor, validatePackUnits } from '../../components/catalog/catalogUtils';
import { formatMoney } from '../../utils/format';

const DEFAULT_CATEGORIES = [
  'Antibiotics',
  'Analgesics',
  'Antipyretics',
  'Cardiovascular',
  'Respiratory',
  'Gastrointestinal',
  'Dermatology',
  'Vitamins & Supplements',
  'Antidiabetics',
  'Antihistamines',
  'Neurology',
  'Ophthalmology',
];

// Must match the backend enum (models/Medicine.js DOSAGE_FORMS)
const DOSAGE_FORMS = [
  'Tablet',
  'Capsule',
  'Syrup',
  'Suspension',
  'Injection',
  'Ointment',
  'Cream',
  'Gel',
  'Inhaler',
  'Drops',
  'Other',
];

const inputCls =
  'w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition disabled:opacity-60';
const labelCls = 'block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1';
const sectionCls = 'pt-4 border-t border-slate-100 dark:border-slate-800/80';
const sectionTitle = 'text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3';

const emptyForm = () => ({
  name: '',
  genericName: '',
  category: DEFAULT_CATEGORIES[0],
  dosageForm: 'Tablet',
  strength: '',
  price: '',
  costPrice: '',
  minStockLevel: 10,
  requiresPrescription: false,
  barcode: '',
  sku: '',
  baseUnit: 'unit',
  minMarginPercent: '',
  taxExempt: false,
  isControlled: false,
  controlledSchedule: '',
  leadTimeDays: 7,
  reorderSafetyDays: 7,
  priceChangeReason: '',
});

const formFromMedicine = (m) => ({
  name: m.name || '',
  genericName: m.genericName || '',
  category: m.category || '',
  dosageForm: m.dosageForm || 'Tablet',
  strength: m.strength || '',
  price: m.price ?? '',
  costPrice: m.costPrice ?? '',
  minStockLevel: m.minStockLevel ?? 10,
  requiresPrescription: !!m.requiresPrescription,
  barcode: m.barcode || '',
  sku: m.sku || '',
  baseUnit: m.baseUnit || 'unit',
  minMarginPercent: m.minMarginPercent ?? '',
  taxExempt: !!m.taxExempt,
  isControlled: !!m.isControlled,
  controlledSchedule: m.controlledSchedule || '',
  leadTimeDays: m.leadTimeDays ?? 7,
  reorderSafetyDays: m.reorderSafetyDays ?? 7,
  priceChangeReason: '',
});

const packsFromMedicine = (m) =>
  (m?.packUnits || []).map((p) => ({
    _id: p._id,
    name: p.name,
    factor: p.factor,
    price: p.price ?? '',
    barcode: p.barcode || '',
  }));

const Toggle = ({ name, checked, onChange }) => (
  <label className="relative inline-flex items-center cursor-pointer shrink-0">
    <input type="checkbox" name={name} checked={checked} onChange={onChange} className="sr-only peer" />
    <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
  </label>
);

const MedicineModal = ({ isOpen, onClose, onSuccess, medicine }) => {
  const { can } = useAuth();
  const [formData, setFormData] = useState(emptyForm);
  const [packUnits, setPackUnits] = useState([]);
  const [customCategory, setCustomCategory] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  // Editing prices of an existing medicine needs price:manage (creating sets the initial price)
  const pricesLocked = !!medicine && !can('price:manage');

  useEffect(() => {
    if (medicine) {
      const isKnownCategory = DEFAULT_CATEGORIES.includes(medicine.category);
      setFormData(formFromMedicine(medicine));
      setPackUnits(packsFromMedicine(medicine));
      setCustomCategory(!isKnownCategory && !!medicine.category);
    } else {
      setFormData(emptyForm());
      setPackUnits([]);
      setCustomCategory(false);
    }
    setError('');
  }, [medicine, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const priceNum = parseFloat(formData.price) || 0;
  const costNum = parseFloat(formData.costPrice) || 0;
  const marginAmt = priceNum - costNum;
  const marginPct = priceNum > 0 ? ((marginAmt / priceNum) * 100).toFixed(1) : 0;
  const warning = marginWarningFor({ price: priceNum, costPrice: costNum, minMarginPercent: formData.minMarginPercent });

  const packPricesChanged = () => {
    const before = new Map(packsFromMedicine(medicine).map((p) => [p.name.toLowerCase(), String(p.price ?? '')]));
    return (
      packUnits.length !== before.size ||
      packUnits.some((p) => before.get(String(p.name).trim().toLowerCase()) !== String(p.price ?? ''))
    );
  };
  const priceChanged =
    !!medicine &&
    (Number(medicine.price) !== priceNum || Number(medicine.costPrice || 0) !== costNum || packPricesChanged());

  const handleGenerateBarcode = async () => {
    if (!medicine) return;
    setGenerating(true);
    setError('');
    try {
      const res = await generateBarcode(medicine._id);
      setFormData((prev) => ({ ...prev, barcode: res.barcode }));
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate barcode');
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      return setError('Medicine brand name is required.');
    }
    if (priceNum <= 0) {
      return setError('Retail price must be greater than zero.');
    }
    const packError = validatePackUnits(packUnits, formData.baseUnit);
    if (packError) return setError(packError);
    if (formData.minMarginPercent !== '' && !(Number(formData.minMarginPercent) >= 0 && Number(formData.minMarginPercent) < 100)) {
      return setError('Minimum margin must be between 0 and 99.99%.');
    }

    setLoading(true);

    try {
      const payload = {
        ...formData,
        price: priceNum,
        costPrice: costNum,
        minStockLevel: Number(formData.minStockLevel) || 0,
        leadTimeDays: Number(formData.leadTimeDays) || 0,
        reorderSafetyDays: Number(formData.reorderSafetyDays) || 0,
        minMarginPercent: formData.minMarginPercent === '' ? null : Number(formData.minMarginPercent),
        baseUnit: formData.baseUnit.trim() || 'unit',
        packUnits: packUnits.map((p) => ({
          ...(p._id ? { _id: p._id } : {}),
          name: String(p.name).trim(),
          factor: Number(p.factor),
          price: p.price === '' || p.price === null ? null : Number(p.price),
          barcode: String(p.barcode || '').trim(),
        })),
      };
      if (!priceChanged) delete payload.priceChangeReason;

      if (medicine) {
        await updateMedicine(medicine._id, payload);
      } else {
        delete payload.priceChangeReason;
        await createMedicine(payload);
      }

      setLoading(false);
      onSuccess();
      onClose();
    } catch (err) {
      setLoading(false);
      setError(err.response?.data?.message || 'Failed to save medicine');
    }
    return undefined;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-[#161c26] border border-slate-200/90 dark:border-slate-800 rounded-2xl max-w-3xl w-full p-6 sm:p-7 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800/80 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <Pill className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                {medicine ? 'Edit Medicine Profile' : 'Register New Medicine'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {medicine
                  ? 'Update formulation, barcodes, pack units, regulatory flags and pricing'
                  : 'Add a prescription or over-the-counter medicine to the catalog'}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>
                Brand / Product Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Amoxil 500"
                required
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>
                Generic Name / Active Substance <span className="text-emerald-600 dark:text-emerald-400">(recommended)</span>
              </label>
              <input
                type="text"
                name="genericName"
                value={formData.genericName}
                onChange={handleChange}
                placeholder="e.g. Amoxicillin"
                className={`${inputCls} border-emerald-300/80 dark:border-emerald-800/80`}
              />
              <p className="text-[10px] text-slate-400 mt-1">Used for drug interaction and allergy checks.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Category <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setCustomCategory(!customCategory)}
                  className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline font-medium cursor-pointer"
                >
                  {customCategory ? 'Select Existing' : '+ Custom'}
                </button>
              </div>
              {customCategory ? (
                <input
                  type="text"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  placeholder="Enter custom category"
                  required
                  className={inputCls}
                />
              ) : (
                <select name="category" value={formData.category} onChange={handleChange} required className={`${inputCls} cursor-pointer`}>
                  {DEFAULT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className={labelCls}>Dosage Form</label>
              <select name="dosageForm" value={formData.dosageForm} onChange={handleChange} className={`${inputCls} cursor-pointer`}>
                {DOSAGE_FORMS.map((form) => (
                  <option key={form} value={form}>
                    {form}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>Strength / Concentration</label>
              <input
                type="text"
                name="strength"
                value={formData.strength}
                onChange={handleChange}
                placeholder="e.g. 500mg, 10mg/ml"
                className={inputCls}
              />
            </div>
          </div>

          {/* Codes */}
          <div className={sectionCls}>
            <p className={sectionTitle}>Barcode & SKU</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Barcode</label>
                  {medicine && !medicine.barcode && !formData.barcode && (
                    <button
                      type="button"
                      onClick={handleGenerateBarcode}
                      disabled={generating}
                      className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline font-medium cursor-pointer inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <Wand2 className="w-3 h-3" /> Generate internal barcode
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  name="barcode"
                  value={formData.barcode}
                  onChange={handleChange}
                  placeholder="Scan or type the product barcode"
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div>
                <label className={labelCls}>SKU / Item Code</label>
                <input
                  type="text"
                  name="sku"
                  value={formData.sku}
                  onChange={handleChange}
                  placeholder="Optional internal code"
                  className={`${inputCls} font-mono`}
                />
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className={sectionCls}>
            <div className="flex items-center justify-between mb-3">
              <p className={`${sectionTitle} mb-0`}>Pricing (per {formData.baseUnit || 'unit'})</p>
              {pricesLocked && (
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                  <Lock className="w-3 h-3" /> You can't change prices (price:manage)
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className={labelCls}>Cost Price</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="costPrice"
                  value={formData.costPrice}
                  onChange={handleChange}
                  placeholder="0.00"
                  disabled={pricesLocked}
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div>
                <label className={labelCls}>
                  Retail Price <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  name="price"
                  value={formData.price}
                  onChange={handleChange}
                  placeholder="0.00"
                  required
                  disabled={pricesLocked}
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div>
                <label className={labelCls}>Min Margin %</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="99.99"
                  name="minMarginPercent"
                  value={formData.minMarginPercent}
                  onChange={handleChange}
                  placeholder="e.g. 20"
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div>
                <label className={labelCls}>Min Stock Alert Level</label>
                <input
                  type="number"
                  min="0"
                  name="minStockLevel"
                  value={formData.minStockLevel}
                  onChange={handleChange}
                  placeholder="10"
                  className={`${inputCls} font-mono`}
                />
              </div>
            </div>

            {priceNum > 0 && costNum > 0 && (
              <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-500 dark:text-slate-400">Estimated Gross Margin:</span>
                <div className="flex items-center gap-3">
                  <MarginBadge warning={warning} />
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    Margin:{' '}
                    <strong className={marginAmt >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}>
                      {formatMoney(marginAmt)}
                    </strong>
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full font-mono text-[11px] font-bold ${
                      warning
                        ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                        : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    }`}
                  >
                    {marginPct}%
                  </span>
                </div>
              </div>
            )}

            {priceChanged && !pricesLocked && (
              <div className="mt-3">
                <label className={labelCls}>Reason for price change (saved in price history)</label>
                <input
                  type="text"
                  name="priceChangeReason"
                  value={formData.priceChangeReason}
                  onChange={handleChange}
                  maxLength={300}
                  placeholder="e.g. Supplier price increase"
                  className={inputCls}
                />
              </div>
            )}
          </div>

          {/* Units */}
          <div className={sectionCls}>
            <p className={sectionTitle}>Units & Pack Sizes</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
              <div>
                <label className={labelCls}>Base Unit (stock is kept in this unit)</label>
                <input
                  type="text"
                  name="baseUnit"
                  value={formData.baseUnit}
                  onChange={handleChange}
                  placeholder="e.g. tablet"
                  className={inputCls}
                />
              </div>
            </div>
            <PackUnitsEditor
              units={packUnits}
              onChange={setPackUnits}
              baseUnit={formData.baseUnit}
              priceDisabled={pricesLocked}
              unitPrice={priceNum}
            />
          </div>

          {/* Purchasing */}
          <div className={sectionCls}>
            <p className={sectionTitle}>Purchasing</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Supplier Lead Time (days)</label>
                <input type="number" min="0" name="leadTimeDays" value={formData.leadTimeDays} onChange={handleChange} className={`${inputCls} font-mono`} />
              </div>
              <div>
                <label className={labelCls}>Safety Stock (days)</label>
                <input type="number" min="0" name="reorderSafetyDays" value={formData.reorderSafetyDays} onChange={handleChange} className={`${inputCls} font-mono`} />
              </div>
            </div>
          </div>

          {/* Regulatory */}
          <div className={`${sectionCls} space-y-3`}>
            <p className={sectionTitle}>Regulatory & Tax</p>
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    formData.requiresPrescription
                      ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {formData.requiresPrescription ? <ShieldAlert className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-white">Prescription Required (Rx Only)</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    POS staff must verify a prescription before dispensing
                  </p>
                </div>
              </div>
              <Toggle name="requiresPrescription" checked={formData.requiresPrescription} onChange={handleChange} />
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-white">Controlled Substance</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Movements are written to the controlled substances register; sales need a patient and prescription
                  </p>
                </div>
                <Toggle name="isControlled" checked={formData.isControlled} onChange={handleChange} />
              </div>
              {formData.isControlled && (
                <div className="mt-3 max-w-xs">
                  <label className={labelCls}>Schedule</label>
                  <input
                    type="text"
                    name="controlledSchedule"
                    value={formData.controlledSchedule}
                    onChange={handleChange}
                    placeholder="e.g. Schedule II / Narcotic"
                    className={inputCls}
                  />
                </div>
              )}
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-white">Tax Exempt</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">No VAT is charged on this medicine</p>
              </div>
              <Toggle name="taxExempt" checked={formData.taxExempt} onChange={handleChange} />
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
              disabled={loading}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-sm transition flex items-center gap-2 cursor-pointer"
            >
              {loading ? (
                <span>Saving...</span>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>{medicine ? 'Save Changes' : 'Register Medicine'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MedicineModal;
