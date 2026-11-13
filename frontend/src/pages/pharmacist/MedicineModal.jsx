import { useState, useEffect } from 'react';
import { Pill, X, AlertCircle, CheckCircle, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createMedicine, updateMedicine, generateBarcode } from '../../api/medicineApi';
import { useAuth } from '../../context/AuthContext';
import PackUnitsEditor from '../../components/catalog/PackUnitsEditor';
import { marginWarningFor, validatePackUnits } from '../../components/catalog/catalogUtils';
import MedicinePricingSection from '../../components/inventory/MedicinePricingSection';
import MedicineRegulatorySection from '../../components/inventory/MedicineRegulatorySection';
import {
  DEFAULT_CATEGORIES,
  DOSAGE_FORMS,
  inputCls,
  labelCls,
  sectionCls,
  sectionTitle,
  emptyForm,
  formFromMedicine,
  packsFromMedicine,
} from '../../components/inventory/medicineForm';

const MedicineModal = ({ isOpen, onClose, onSuccess, medicine }) => {
  const { t } = useTranslation('medicines');
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
      setError(err.response?.data?.message || t('modal.errGenerateBarcode'));
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      return setError(t('modal.errNameRequired'));
    }
    if (priceNum <= 0) {
      return setError(t('modal.errPriceRequired'));
    }
    const packError = validatePackUnits(packUnits, formData.baseUnit, t);
    if (packError) return setError(packError);
    if (formData.minMarginPercent !== '' && !(Number(formData.minMarginPercent) >= 0 && Number(formData.minMarginPercent) < 100)) {
      return setError(t('modal.errMinMargin'));
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
      setError(err.response?.data?.message || t('modal.errSave'));
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
                {medicine ? t('modal.editTitle') : t('modal.createTitle')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {medicine ? t('modal.editSubtitle') : t('modal.createSubtitle')}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>
                {t('modal.brandName')} <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder={t('modal.brandPlaceholder')}
                required
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>
                {t('modal.genericName')} <span className="text-emerald-600 dark:text-emerald-400">{t('modal.recommended')}</span>
              </label>
              <input
                type="text"
                name="genericName"
                value={formData.genericName}
                onChange={handleChange}
                placeholder={t('modal.genericPlaceholder')}
                className={`${inputCls} border-emerald-300/80 dark:border-emerald-800/80`}
              />
              <p className="text-[10px] text-slate-400 mt-1">{t('modal.genericHint')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {t('modal.category')} <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setCustomCategory(!customCategory)}
                  className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline font-medium cursor-pointer"
                >
                  {customCategory ? t('modal.selectExisting') : t('modal.customCategory')}
                </button>
              </div>
              {customCategory ? (
                <input
                  type="text"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  placeholder={t('modal.customCategoryPlaceholder')}
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
              <label className={labelCls}>{t('modal.dosageForm')}</label>
              <select name="dosageForm" value={formData.dosageForm} onChange={handleChange} className={`${inputCls} cursor-pointer`}>
                {DOSAGE_FORMS.map((form) => (
                  <option key={form} value={form}>
                    {form}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>{t('modal.strength')}</label>
              <input
                type="text"
                name="strength"
                value={formData.strength}
                onChange={handleChange}
                placeholder={t('modal.strengthPlaceholder')}
                className={inputCls}
              />
            </div>
          </div>

          {/* Codes */}
          <div className={sectionCls}>
            <p className={sectionTitle}>{t('modal.codesTitle')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t('modal.barcode')}</label>
                  {medicine && !medicine.barcode && !formData.barcode && (
                    <button
                      type="button"
                      onClick={handleGenerateBarcode}
                      disabled={generating}
                      className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline font-medium cursor-pointer inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <Wand2 className="w-3 h-3" /> {t('modal.generateBarcode')}
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  name="barcode"
                  value={formData.barcode}
                  onChange={handleChange}
                  placeholder={t('modal.barcodePlaceholder')}
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div>
                <label className={labelCls}>{t('modal.sku')}</label>
                <input
                  type="text"
                  name="sku"
                  value={formData.sku}
                  onChange={handleChange}
                  placeholder={t('modal.skuPlaceholder')}
                  className={`${inputCls} font-mono`}
                />
              </div>
            </div>
          </div>

          <MedicinePricingSection
            formData={formData}
            onChange={handleChange}
            pricesLocked={pricesLocked}
            priceNum={priceNum}
            costNum={costNum}
            marginAmt={marginAmt}
            marginPct={marginPct}
            warning={warning}
            priceChanged={priceChanged}
          />

          {/* Units */}
          <div className={sectionCls}>
            <p className={sectionTitle}>{t('modal.unitsTitle')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
              <div>
                <label className={labelCls}>{t('modal.baseUnit')}</label>
                <input
                  type="text"
                  name="baseUnit"
                  value={formData.baseUnit}
                  onChange={handleChange}
                  placeholder={t('modal.baseUnitPlaceholder')}
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
            <p className={sectionTitle}>{t('modal.purchasingTitle')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>{t('modal.leadTime')}</label>
                <input type="number" min="0" name="leadTimeDays" value={formData.leadTimeDays} onChange={handleChange} className={`${inputCls} font-mono`} />
              </div>
              <div>
                <label className={labelCls}>{t('modal.safetyStock')}</label>
                <input type="number" min="0" name="reorderSafetyDays" value={formData.reorderSafetyDays} onChange={handleChange} className={`${inputCls} font-mono`} />
              </div>
            </div>
          </div>

          <MedicineRegulatorySection formData={formData} onChange={handleChange} />

          {/* Form Actions */}
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
                <span>{t('modal.saving')}</span>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>{medicine ? t('modal.saveChanges') : t('modal.register')}</span>
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
