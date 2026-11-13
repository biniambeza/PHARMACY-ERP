import { useState } from 'react';
import { Percent, Eye, CheckCircle } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';
import CatalogModal from './CatalogModal';
import MarginBadge from './MarginBadge';
import { previewBulkPrice, applyBulkPrice } from '../../api/medicineApi';
import { formatMoney } from '../../utils/format';
import { inputCls, labelCls, primaryBtn, secondaryBtn, errorBox, theadCls, thCls } from './styles';

// Bulk price update by category, by selected medicines, or for the whole catalog.
const BulkPriceModal = ({ categories = [], selectedIds = [], onClose, onSuccess }) => {
  const { t } = useTranslation('medicines');
  const [target, setTarget] = useState(selectedIds.length ? 'selected' : 'category');
  const [category, setCategory] = useState(categories[0] || '');
  const [field, setField] = useState('price');
  const [mode, setMode] = useState('percent');
  const [value, setValue] = useState('');
  const [roundTo, setRoundTo] = useState('');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const body = () => {
    const filter = {};
    if (target === 'selected') filter.ids = selectedIds;
    else if (target === 'category') filter.category = category;
    else filter.all = true;
    return { filter, mode, field, value: Number(value), roundTo: roundTo === '' ? undefined : Number(roundTo), reason };
  };

  const resetPreview = (fn) => (e) => {
    fn(e.target.value);
    setPreview(null);
  };

  const handlePreview = async () => {
    setError('');
    if (value === '' || !Number.isFinite(Number(value))) {
      setError(t('bulk.errValue'));
      return;
    }
    setLoading(true);
    try {
      setPreview(await previewBulkPrice(body()));
    } catch (err) {
      setError(err.response?.data?.message || t('bulk.errPreview'));
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!preview) return;
    if (!window.confirm(t('bulk.confirm', { count: preview.changedCount }))) return;
    setLoading(true);
    setError('');
    try {
      const res = await applyBulkPrice(body());
      alert(res.message);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || t('bulk.errApply'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <CatalogModal
      title={t('bulk.title')}
      subtitle={t('bulk.subtitle')}
      icon={Percent}
      onClose={onClose}
      maxWidth="max-w-3xl"
    >
      {error && <div className={`${errorBox} mb-4`}>{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>{t('bulk.applyTo')}</label>
          <select className={inputCls} value={target} onChange={resetPreview(setTarget)}>
            {selectedIds.length > 0 && <option value="selected">{t('bulk.selected', { n: selectedIds.length })}</option>}
            <option value="category">{t('bulk.aCategory')}</option>
            <option value="all">{t('bulk.all')}</option>
          </select>
        </div>
        {target === 'category' && (
          <div>
            <label className={labelCls}>{t('bulk.category')}</label>
            <select className={inputCls} value={category} onChange={resetPreview(setCategory)}>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className={labelCls}>{t('bulk.priceField')}</label>
          <select className={inputCls} value={field} onChange={resetPreview(setField)}>
            <option value="price">{t('bulk.sellingPrice')}</option>
            <option value="costPrice">{t('bulk.costPrice')}</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>{t('bulk.mode')}</label>
          <select className={inputCls} value={mode} onChange={resetPreview(setMode)}>
            <option value="percent">{t('bulk.modePercent')}</option>
            <option value="set">{t('bulk.modeSet')}</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>{mode === 'percent' ? t('bulk.percentLabel') : t('bulk.newPrice')}</label>
          <input className={`${inputCls} font-mono`} type="number" step="0.01" value={value} onChange={resetPreview(setValue)} />
        </div>
        <div>
          <label className={labelCls}>{t('bulk.roundTo')}</label>
          <input
            className={`${inputCls} font-mono`}
            type="number"
            step="0.01"
            min="0"
            placeholder={t('bulk.roundPlaceholder')}
            value={roundTo}
            onChange={resetPreview(setRoundTo)}
          />
        </div>
        <div className="sm:col-span-3">
          <label className={labelCls}>{t('bulk.reason')}</label>
          <input
            className={inputCls}
            value={reason}
            maxLength={300}
            placeholder={t('bulk.reasonPlaceholder')}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>

      {preview && (
        <div className="mt-5">
          <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">
            <Trans t={t} i18nKey="bulk.summary" values={{ count: preview.count, changed: preview.changedCount }} components={{ 1: <strong /> }} />
            {preview.warningCount > 0 && (
              <span className="text-amber-600 dark:text-amber-400">{t('bulk.warnings', { count: preview.warningCount })}</span>
            )}
            .
          </p>
          <div className="max-h-72 overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-xl">
            <table className="w-full text-xs">
              <thead className={theadCls}>
                <tr>
                  <th className={thCls}>{t('bulk.colMedicine')}</th>
                  <th className={thCls}>{t('bulk.colOld')}</th>
                  <th className={thCls}>{t('bulk.colNew')}</th>
                  <th className={thCls}>{t('bulk.colMargin')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {preview.items.map((i) => (
                  <tr key={i._id} className={i.changed ? '' : 'opacity-50'}>
                    <td className="py-2 px-4">{i.name}</td>
                    <td className="py-2 px-4 font-mono">{formatMoney(i.old)}</td>
                    <td className="py-2 px-4 font-mono font-semibold">{formatMoney(i.new)}</td>
                    <td className="py-2 px-4"><MarginBadge warning={i.marginWarning} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-4 mt-5 border-t border-slate-100 dark:border-slate-800/80">
        <button type="button" className={secondaryBtn} onClick={handlePreview} disabled={loading}>
          <Eye className="w-4 h-4" /> {t('bulk.preview')}
        </button>
        <button
          type="button"
          className={primaryBtn}
          onClick={handleApply}
          disabled={loading || !preview || preview.changedCount === 0}
        >
          <CheckCircle className="w-4 h-4" /> {t('bulk.apply')}
        </button>
      </div>
    </CatalogModal>
  );
};

export default BulkPriceModal;
