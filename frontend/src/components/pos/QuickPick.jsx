import { Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../../utils/format';
import { cardCls } from './posUtils';

// Quick-pick grid of the top-selling medicines (#29). Props: { items: medicines[], availableOf, onAdd }
const QuickPick = ({ items, availableOf, onAdd }) => {
  const { t } = useTranslation('pos');
  if (!items || items.length === 0) return null;
  return (
    <div className={`${cardCls} p-3`}>
      <div className="flex items-center gap-1.5 mb-2">
        <Zap className="w-3.5 h-3.5 text-amber-500" />
        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('quickPick')}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-1.5">
        {items.map((med) => {
          const out = availableOf(med) <= 0;
          return (
            <button
              key={med._id}
              type="button"
              disabled={out}
              onClick={() => onAdd(med)}
              className="text-left px-2.5 py-2 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-900/50 hover:border-emerald-500/60 hover:bg-white dark:hover:bg-slate-800 transition disabled:opacity-40 cursor-pointer"
            >
              <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 truncate">{med.name}</div>
              <div className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">{formatMoney(med.price)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default QuickPick;
