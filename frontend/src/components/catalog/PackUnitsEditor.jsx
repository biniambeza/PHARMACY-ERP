import { Plus, Trash2 } from 'lucide-react';
import { inputCls } from './styles';

// Editable list of pack units [{ name, factor, price, barcode }].
// Validation lives in catalogUtils.validatePackUnits.
const PackUnitsEditor = ({ units, onChange, baseUnit, priceDisabled = false, unitPrice = 0 }) => {
  const update = (i, key, value) => {
    onChange(units.map((u, idx) => (idx === i ? { ...u, [key]: value } : u)));
  };
  const add = () => onChange([...units, { name: '', factor: '', price: '', barcode: '' }]);
  const remove = (i) => onChange(units.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {units.length === 0 && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          No pack units. Stock and sales use the base unit ({baseUnit || 'unit'}) only.
        </p>
      )}
      {units.length > 0 && (
        <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
          <span className="col-span-3">Pack name</span>
          <span className="col-span-2">Factor</span>
          <span className="col-span-3">Pack price</span>
          <span className="col-span-3">Barcode</span>
        </div>
      )}
      {units.map((u, i) => {
        const suggested = Number(u.factor) > 1 && unitPrice > 0 ? (unitPrice * Number(u.factor)).toFixed(2) : '';
        return (
          <div key={u._id || `new-${i}`} className="grid grid-cols-12 gap-2 items-center">
            <input
              aria-label="Pack name"
              className={`${inputCls} col-span-3`}
              placeholder="e.g. strip"
              value={u.name}
              onChange={(e) => update(i, 'name', e.target.value)}
            />
            <input
              aria-label="Base units per pack"
              className={`${inputCls} col-span-2 font-mono`}
              type="number"
              min="2"
              step="1"
              placeholder="10"
              value={u.factor}
              onChange={(e) => update(i, 'factor', e.target.value)}
            />
            <input
              aria-label="Pack price"
              className={`${inputCls} col-span-3 font-mono disabled:opacity-60`}
              type="number"
              min="0"
              step="0.01"
              placeholder={suggested ? `${suggested} (auto)` : 'auto'}
              value={u.price ?? ''}
              disabled={priceDisabled}
              onChange={(e) => update(i, 'price', e.target.value)}
            />
            <input
              aria-label="Pack barcode"
              className={`${inputCls} col-span-3 font-mono`}
              placeholder="Barcode"
              value={u.barcode || ''}
              onChange={(e) => update(i, 'barcode', e.target.value)}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              title="Remove pack unit"
              className="col-span-1 p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition cursor-pointer justify-self-center"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={add}
        className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline font-semibold inline-flex items-center gap-1 cursor-pointer"
      >
        <Plus className="w-3 h-3" /> Add pack unit
      </button>
      <p className="text-[10px] text-slate-400">
        Factor = number of {baseUnit || 'unit'}s in one pack. Leave the price empty to sell at unit price x factor.
      </p>
    </div>
  );
};

export default PackUnitsEditor;
