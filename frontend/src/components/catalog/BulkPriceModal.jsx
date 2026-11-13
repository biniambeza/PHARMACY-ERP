import { useState } from 'react';
import { Percent, Eye, CheckCircle } from 'lucide-react';
import CatalogModal from './CatalogModal';
import MarginBadge from './MarginBadge';
import { previewBulkPrice, applyBulkPrice } from '../../api/medicineApi';
import { formatMoney } from '../../utils/format';
import { inputCls, labelCls, primaryBtn, secondaryBtn, errorBox, theadCls, thCls } from './styles';

// Bulk price update by category, by selected medicines, or for the whole catalog.
const BulkPriceModal = ({ categories = [], selectedIds = [], onClose, onSuccess }) => {
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
      setError('Enter a value.');
      return;
    }
    setLoading(true);
    try {
      setPreview(await previewBulkPrice(body()));
    } catch (err) {
      setError(err.response?.data?.message || 'Preview failed');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!preview) return;
    if (!window.confirm(`Update ${preview.changedCount} price(s)?`)) return;
    setLoading(true);
    setError('');
    try {
      const res = await applyBulkPrice(body());
      alert(res.message);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Bulk update failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <CatalogModal
      title="Bulk Price Update"
      subtitle="Change prices by percentage or to a fixed value. Every change is recorded in price history."
      icon={Percent}
      onClose={onClose}
      maxWidth="max-w-3xl"
    >
      {error && <div className={`${errorBox} mb-4`}>{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Apply to</label>
          <select className={inputCls} value={target} onChange={resetPreview(setTarget)}>
            {selectedIds.length > 0 && <option value="selected">Selected medicines ({selectedIds.length})</option>}
            <option value="category">A category</option>
            <option value="all">All medicines</option>
          </select>
        </div>
        {target === 'category' && (
          <div>
            <label className={labelCls}>Category</label>
            <select className={inputCls} value={category} onChange={resetPreview(setCategory)}>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className={labelCls}>Price field</label>
          <select className={inputCls} value={field} onChange={resetPreview(setField)}>
            <option value="price">Selling price</option>
            <option value="costPrice">Cost price</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Mode</label>
          <select className={inputCls} value={mode} onChange={resetPreview(setMode)}>
            <option value="percent">Change by %</option>
            <option value="set">Set to amount</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>{mode === 'percent' ? 'Percent (e.g. 10 or -5)' : 'New price'}</label>
          <input className={`${inputCls} font-mono`} type="number" step="0.01" value={value} onChange={resetPreview(setValue)} />
        </div>
        <div>
          <label className={labelCls}>Round to (optional)</label>
          <input
            className={`${inputCls} font-mono`}
            type="number"
            step="0.01"
            min="0"
            placeholder="e.g. 0.5 or 1"
            value={roundTo}
            onChange={resetPreview(setRoundTo)}
          />
        </div>
        <div className="sm:col-span-3">
          <label className={labelCls}>Reason</label>
          <input
            className={inputCls}
            value={reason}
            maxLength={300}
            placeholder="e.g. Supplier price increase"
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>

      {preview && (
        <div className="mt-5">
          <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">
            {preview.count} medicine(s) match, <strong>{preview.changedCount}</strong> will change
            {preview.warningCount > 0 && (
              <span className="text-amber-600 dark:text-amber-400">, {preview.warningCount} with margin warnings</span>
            )}
            .
          </p>
          <div className="max-h-72 overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-xl">
            <table className="w-full text-xs">
              <thead className={theadCls}>
                <tr>
                  <th className={thCls}>Medicine</th>
                  <th className={thCls}>Old</th>
                  <th className={thCls}>New</th>
                  <th className={thCls}>Margin</th>
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
          <Eye className="w-4 h-4" /> Preview
        </button>
        <button
          type="button"
          className={primaryBtn}
          onClick={handleApply}
          disabled={loading || !preview || preview.changedCount === 0}
        >
          <CheckCircle className="w-4 h-4" /> Apply
        </button>
      </div>
    </CatalogModal>
  );
};

export default BulkPriceModal;
