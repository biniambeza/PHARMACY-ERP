import { useState, useEffect } from 'react';
import { PackagePlus, X, Calendar, DollarSign, Layers, Hash, CheckCircle, AlertCircle, Sparkles, ScanBarcode } from 'lucide-react';
import { getMedicines, lookupMedicine } from '../../api/medicineApi';
import { formatMoney } from '../../utils/format';
import { addStockBatch } from '../../api/stockApi';
import { useTranslation, Trans } from 'react-i18next';
import EthiopianDateHint from '../../components/common/EthiopianDateHint';

// Mounted only while open, so every opening starts from a fresh form.
const newLotNo = () => `LOT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

const StockInModalBody = ({ onClose, onSuccess }) => {
  const { t } = useTranslation('stock');
  const [medicines, setMedicines] = useState([]);
  const [formData, setFormData] = useState(() => ({
    medicineId: '',
    batchNo: newLotNo(),
    quantity: '',
    expiryDate: '',
    purchasePrice: '',
    unitName: '',
  }));
  const [scanCode, setScanCode] = useState('');
  const [scanMessage, setScanMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingMeds, setFetchingMeds] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getMedicines()
      .then((res) => {
        const medList = res.medicines || [];
        setMedicines(medList);
        if (medList.length > 0) {
          setFormData((prev) => ({
            ...prev,
            medicineId: medList[0]._id,
            purchasePrice: medList[0].costPrice || '',
          }));
        }
      })
      .catch(() => setError(t('stockIn.loadFailed')))
      .finally(() => setFetchingMeds(false));
  }, [t]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const updated = { ...prev, [name]: value };
      if (name === 'medicineId') {
        const selected = medicines.find((m) => m._id === value);
        updated.unitName = '';
        if (selected && selected.costPrice) {
          updated.purchasePrice = selected.costPrice;
        }
      }
      if (name === 'unitName') {
        // Keep the cost consistent with the chosen unit (cost is per entered unit)
        const selected = medicines.find((m) => m._id === prev.medicineId);
        const factorOf = (u) => selected?.packUnits?.find((p) => p.name === u)?.factor || 1;
        const cost = parseFloat(prev.purchasePrice);
        if (Number.isFinite(cost) && cost > 0) {
          updated.purchasePrice = Number(((cost / factorOf(prev.unitName)) * factorOf(value)).toFixed(4));
        }
      }
      return updated;
    });
  };

  // USB scanners type the code and press Enter
  const handleScan = async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const code = scanCode.trim();
    if (!code) return;
    try {
      const res = await lookupMedicine(code);
      const med = res.medicine;
      if (!medicines.some((m) => m._id === med._id)) setMedicines((prev) => [...prev, med]);
      const isPack = res.unit && res.unit.factor > 1;
      setFormData((prev) => ({
        ...prev,
        medicineId: med._id,
        unitName: isPack ? res.unit.name : '',
        purchasePrice: med.costPrice ? Number((med.costPrice * (isPack ? res.unit.factor : 1)).toFixed(4)) : prev.purchasePrice,
      }));
      setScanMessage(isPack ? t('stockIn.scanPack', { name: med.name, unit: res.unit.name, factor: res.unit.factor }) : med.name);
      setScanCode('');
    } catch (err) {
      setScanMessage(err.response?.data?.message || t('stockIn.scanNotFound'));
    }
  };

  const handleGenerateBatchNo = () => {
    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    setFormData((prev) => ({
      ...prev,
      batchNo: `LOT-${new Date().getFullYear()}-${randomSuffix}`,
    }));
  };

  const selectedMedForUnits = medicines.find((m) => m._id === formData.medicineId);
  const packUnits = selectedMedForUnits?.packUnits || [];
  const unitFactor = packUnits.find((p) => p.name === formData.unitName)?.factor || 1;
  const baseUnitName = selectedMedForUnits?.baseUnit || 'unit';
  const qtyNum = parseInt(formData.quantity, 10) || 0;
  const costNum = parseFloat(formData.purchasePrice) || 0;
  const totalValuation = qtyNum * costNum;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.medicineId) {
      return setError(t('stockIn.errSelectMedicine'));
    }
    if (!formData.batchNo.trim()) {
      return setError(t('stockIn.errBatchNo'));
    }
    if (qtyNum <= 0) {
      return setError(t('stockIn.errQuantity'));
    }
    if (!formData.expiryDate) {
      return setError(t('stockIn.errExpiry'));
    }

    setLoading(true);

    try {
      await addStockBatch({
        medicineId: formData.medicineId,
        batchNo: formData.batchNo.trim(),
        quantity: qtyNum,
        expiryDate: formData.expiryDate,
        purchasePrice: costNum,
        ...(formData.unitName ? { unitName: formData.unitName } : {}),
      });

      setLoading(false);
      onSuccess();
      onClose();
    } catch (err) {
      setLoading(false);
      setError(err.response?.data?.message || t('stockIn.saveFailed'));
    }
  };

  const selectedMed = medicines.find((m) => m._id === formData.medicineId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-[#161c26] border border-slate-200/90 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 sm:p-7 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800/80 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <PackagePlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                {t('stockIn.title')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('stockIn.subtitle')}
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
          {/* Barcode scan */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {t('stockIn.scanLabel')}
            </label>
            <div className="relative">
              <ScanBarcode className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={scanCode}
                onChange={(e) => setScanCode(e.target.value)}
                onKeyDown={handleScan}
                placeholder={t('stockIn.scanPlaceholder')}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white font-mono placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              />
            </div>
            {scanMessage && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 px-1">{scanMessage}</p>
            )}
          </div>

          {/* Medicine Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {t('stockIn.medicineLabel')} <span className="text-rose-500">*</span>
            </label>
            {fetchingMeds ? (
              <div className="py-2 text-xs text-slate-400">{t('stockIn.loadingCatalog')}</div>
            ) : medicines.length === 0 ? (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-xl text-xs text-amber-700 dark:text-amber-300">
                {t('stockIn.noMedicines')}
              </div>
            ) : (
              <select
                name="medicineId"
                value={formData.medicineId}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition cursor-pointer"
              >
                {medicines.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.name} {m.dosageForm ? `(${m.dosageForm})` : ''} - {t('stockIn.retail', { price: formatMoney(m.price) })}
                  </option>
                ))}
              </select>
            )}
            {selectedMed && (
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1 px-1">
                <span>{t('stockIn.generic', { name: selectedMed.genericName || t('stockIn.standardFormulation') })}</span>
                <span>{t('stockIn.category', { category: selectedMed.category })}</span>
              </div>
            )}
          </div>

          {/* Batch Number */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {t('stockIn.batchLabel')} <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleGenerateBatchNo}
                className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
              >
                <Sparkles className="w-3 h-3" /> {t('stockIn.autoGenerate')}
              </button>
            </div>
            <div className="relative">
              <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                name="batchNo"
                value={formData.batchNo}
                onChange={handleChange}
                placeholder={t('stockIn.batchPlaceholder')}
                required
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white font-mono placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Units Received */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t('stockIn.quantityLabel')} <span className="text-rose-500">*</span>
              </label>
              {packUnits.length > 0 && (
                <select
                  name="unitName"
                  value={formData.unitName}
                  onChange={handleChange}
                  className="w-full mb-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition cursor-pointer"
                >
                  <option value="">{t('stockIn.baseUnit', { unit: baseUnitName })}</option>
                  {packUnits.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} ({p.factor} {baseUnitName})
                    </option>
                  ))}
                </select>
              )}
              <div className="relative">
                <Layers className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="number"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleChange}
                  placeholder={t('stockIn.quantityPlaceholder')}
                  min="1"
                  required
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white font-mono placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                />
              </div>
            </div>

            {/* Expiration Date */}
            <div>
              <label htmlFor="stockin-expiry" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t('stockIn.expiryLabel')} <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  id="stockin-expiry"
                  type="date"
                  name="expiryDate"
                  value={formData.expiryDate}
                  onChange={handleChange}
                  required
                  aria-describedby="stockin-expiry-eth"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition cursor-pointer"
                />
              </div>
              <EthiopianDateHint value={formData.expiryDate} id="stockin-expiry-eth" />
            </div>
          </div>

          {/* Unit Cost Price */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {t('stockIn.costLabel', { unit: formData.unitName || baseUnitName })}
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
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white font-mono placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              />
            </div>
          </div>

          {unitFactor > 1 && qtyNum > 0 && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 px-1">
              <Trans
                t={t}
                i18nKey="stockIn.conversion"
                values={{ total: qtyNum * unitFactor, base: baseUnitName, qty: qtyNum, unit: formData.unitName, factor: unitFactor }}
                components={{ b: <strong /> }}
              />
            </p>
          )}

          {/* Valuation calculation preview */}
          {qtyNum > 0 && costNum > 0 && (
            <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-xl border border-emerald-200/80 dark:border-emerald-900/40 flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-300">{t('stockIn.totalValuation')}</span>
              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300 text-sm">
                {formatMoney(totalValuation)}
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
              {t('common:buttons.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading || medicines.length === 0}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-sm transition flex items-center gap-2 cursor-pointer"
            >
              {loading ? (
                <span>{t('stockIn.saving')}</span>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>{t('stockIn.confirm')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const StockInModal = ({ isOpen, ...props }) => (isOpen ? <StockInModalBody {...props} /> : null);

export default StockInModal;
