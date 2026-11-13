import { Minus, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../../utils/format';
import { unitsOf } from './posUtils';

/**
 * Cart lines with a unit selector (pack units, #13) and quantity stepper.
 * Props:
 *   cart: [{ key, medicineId, name, quantity, unit: { name, factor, price }, medicine, ... }]
 *   selectedKey, onSelect(key)
 *   onQty(key, qty), onUnit(key, unitName), onRemove(key)
 *   maxQtyOf(line) -> max quantity in the line's unit
 *   registerQtyInput(key, el): lets the POS focus a line's quantity (F4)
 */
const CartLines = ({ cart, selectedKey, onSelect, onQty, onUnit, onRemove, maxQtyOf, registerQtyInput }) => {
  const { t } = useTranslation('pos');
  if (cart.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-slate-400">
        {t('cart.empty')}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {cart.map((line) => {
        const units = unitsOf(line.medicine);
        const max = maxQtyOf(line);
        const selected = line.key === selectedKey;
        return (
          <div
            key={line.key}
            onClick={() => onSelect(line.key)}
            className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition ${
              selected
                ? 'border-emerald-500/70 bg-emerald-50/60 dark:bg-emerald-950/20'
                : 'border-slate-200/80 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900/60'
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h4 className="text-xs font-semibold text-slate-900 dark:text-white truncate">{line.name}</h4>
                {line.medicine.requiresPrescription && <span className="text-[9px] font-bold text-amber-600">Rx</span>}
                {line.medicine.isControlled && <span className="text-[9px] font-bold text-rose-600">CD</span>}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {units.length > 1 ? (
                  <select
                    value={line.unit.name}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onUnit(line.key, e.target.value)}
                    className="text-[10px] px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    {units.map((u) => (
                      <option key={u.name} value={u.name}>
                        {u.name}{u.factor > 1 ? ` ×${u.factor}` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[10px] text-slate-500">{line.unit.name}</span>
                )}
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  {formatMoney(line.unit.price)} × {line.quantity} = {formatMoney(line.unit.price * line.quantity)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => onQty(line.key, line.quantity - 1)}
                disabled={line.quantity <= 1}
                aria-label={t('cart.decrease')}
                className="w-6 h-6 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-30 flex items-center justify-center cursor-pointer"
              >
                <Minus className="w-3 h-3" />
              </button>
              <input
                ref={(el) => registerQtyInput(line.key, el)}
                type="number"
                min={1}
                max={max}
                value={line.quantity}
                onFocus={(e) => {
                  onSelect(line.key);
                  e.target.select();
                }}
                onChange={(e) => onQty(line.key, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                className="w-12 text-center bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg py-0.5 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => onQty(line.key, line.quantity + 1)}
                disabled={line.quantity >= max}
                aria-label={t('cart.increase')}
                className="w-6 h-6 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-30 flex items-center justify-center cursor-pointer"
              >
                <Plus className="w-3 h-3" />
              </button>
              <button type="button" onClick={() => onRemove(line.key)} className="text-slate-400 hover:text-rose-500 p-1 cursor-pointer" title={t('cart.remove')}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default CartLines;
