import { ShoppingCart, PauseCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Title row of the current sale: line count, Hold and Clear. Props: { count, onHold(), onClear() }
const CartHeader = ({ count, onHold, onClear }) => {
  const { t } = useTranslation('pos');
  return (
    <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/80 dark:border-slate-800">
      <div className="flex items-center gap-2">
        <ShoppingCart className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">{t('cart.title')}</h2>
        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
          {t('cart.lines', { count })}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {count > 0 && (
          <button type="button" onClick={onHold} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-emerald-600 cursor-pointer">
            <PauseCircle className="w-3.5 h-3.5" /> {t('cart.hold')}
          </button>
        )}
        {count > 0 && (
          <button type="button" onClick={onClear} className="text-xs text-rose-500 hover:text-rose-700 font-semibold cursor-pointer">
            {t('cart.clear')}
          </button>
        )}
      </div>
    </div>
  );
};

export default CartHeader;
