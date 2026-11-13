import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import MarginBadge from '../catalog/MarginBadge';
import { formatMoney } from '../../utils/format';
import { inputCls, labelCls, sectionCls, sectionTitle } from './medicineForm';

// Pricing block of MedicineModal: cost/retail price, min margin, min stock,
// live margin preview and the price-change reason.
const MedicinePricingSection = ({
  formData,
  onChange,
  pricesLocked,
  priceNum,
  costNum,
  marginAmt,
  marginPct,
  warning,
  priceChanged,
}) => {
  const { t } = useTranslation('medicines');

  return (
    <div className={sectionCls}>
      <div className="flex items-center justify-between mb-3">
        <p className={`${sectionTitle} mb-0`}>{t('modal.pricingTitle', { unit: formData.baseUnit || 'unit' })}</p>
        {pricesLocked && (
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
            <Lock className="w-3 h-3" /> {t('modal.pricesLocked')}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div>
          <label className={labelCls}>{t('modal.costPrice')}</label>
          <input
            type="number"
            step="0.01"
            min="0"
            name="costPrice"
            value={formData.costPrice}
            onChange={onChange}
            placeholder="0.00"
            disabled={pricesLocked}
            className={`${inputCls} font-mono`}
          />
        </div>
        <div>
          <label className={labelCls}>
            {t('modal.retailPrice')} <span className="text-rose-500">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            name="price"
            value={formData.price}
            onChange={onChange}
            placeholder="0.00"
            required
            disabled={pricesLocked}
            className={`${inputCls} font-mono`}
          />
        </div>
        <div>
          <label className={labelCls}>{t('modal.minMargin')}</label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="99.99"
            name="minMarginPercent"
            value={formData.minMarginPercent}
            onChange={onChange}
            placeholder={t('modal.minMarginPlaceholder')}
            className={`${inputCls} font-mono`}
          />
        </div>
        <div>
          <label className={labelCls}>{t('modal.minStock')}</label>
          <input
            type="number"
            min="0"
            name="minStockLevel"
            value={formData.minStockLevel}
            onChange={onChange}
            placeholder="10"
            className={`${inputCls} font-mono`}
          />
        </div>
      </div>

      {priceNum > 0 && costNum > 0 && (
        <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400">{t('modal.estimatedMargin')}</span>
          <div className="flex items-center gap-3">
            <MarginBadge warning={warning} />
            <span className="font-mono text-slate-700 dark:text-slate-300">
              {t('modal.margin')}{' '}
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
          <label className={labelCls}>{t('modal.priceChangeReason')}</label>
          <input
            type="text"
            name="priceChangeReason"
            value={formData.priceChangeReason}
            onChange={onChange}
            maxLength={300}
            placeholder={t('modal.priceChangePlaceholder')}
            className={inputCls}
          />
        </div>
      )}
    </div>
  );
};

export default MedicinePricingSection;
