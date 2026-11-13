import { useMemo, useState } from 'react';
import { Search, Package, Plus, ScanLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../../utils/format';
import { cardCls, unitsOf } from './posUtils';

const MAX_RESULTS = 60;

/**
 * Medicine search with keyboard navigation (#29) and scan-to-add (#3).
 * Props:
 *   medicines: catalog [{ _id, name, genericName, category, price, stock, packUnits, ... }]
 *   loading
 *   availableOf(med) -> base units still available (stock minus cart)
 *   onAdd(med, unit?)  unit = one of unitsOf(med) (defaults to the base unit)
 *   onCode(code) -> Promise<boolean>: try the text as a barcode/SKU (Enter with no matching result)
 *   inputRef: ref to the search input (F2 focuses it)
 */
const ProductSearch = ({ medicines, loading, availableOf, onAdd, onCode, inputRef }) => {
  const { t } = useTranslation('pos');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [active, setActive] = useState(0);

  const categories = useMemo(
    () => [...new Set(medicines.map((m) => m.category).filter(Boolean))].sort(),
    [medicines]
  );

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    return medicines
      .filter((m) => {
        if (category && m.category !== category) return false;
        if (!q) return true;
        return (
          m.name.toLowerCase().includes(q) ||
          (m.genericName || '').toLowerCase().includes(q) ||
          (m.barcode || '') === search.trim() ||
          (m.sku || '').toLowerCase() === q
        );
      })
      .slice(0, MAX_RESULTS);
  }, [medicines, search, category]);

  const activeIndex = Math.min(active, Math.max(0, results.length - 1));

  const onKeyDown = async (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(Math.min(results.length - 1, activeIndex + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(0, activeIndex - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const text = search.trim();
      if (!text && results.length === 0) return;
      // Exact code first (scanner typing into the search box), then the highlighted result
      const looksLikeCode = /^[A-Za-z0-9-]{4,}$/.test(text);
      if (looksLikeCode && (await onCode?.(text))) {
        setSearch('');
        setActive(0);
        return;
      }
      const med = results[activeIndex];
      if (med) {
        onAdd(med);
        setSearch('');
        setActive(0);
      }
    }
  };

  return (
    <div className="space-y-3">
      <div className={`${cardCls} p-3 flex flex-col sm:flex-row gap-2.5 items-center`}>
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            ref={inputRef}
            type="text"
            data-pos-scan="true"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={t('search.placeholder')}
            className="w-full pl-9 pr-9 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
          />
          <ScanLine className="w-4 h-4 text-slate-300 dark:text-slate-600 absolute right-3 top-2.5" />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full sm:w-48 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer"
        >
          <option value="">{t('search.allCategories')}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className={`${cardCls} p-2 min-h-[320px] max-h-[520px] overflow-y-auto custom-scrollbar`}>
        {loading ? (
          <div className="p-10 text-center text-xs text-slate-400">{t('search.loading')}</div>
        ) : results.length === 0 ? (
          <div className="p-10 text-center">
            <Package className="w-6 h-6 mx-auto mb-2 text-slate-400" />
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('search.noResults')}</p>
          </div>
        ) : (
          <ul role="listbox" className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {results.map((med, i) => {
              const available = availableOf(med);
              const out = available <= 0;
              const packs = unitsOf(med).slice(1);
              return (
                <li
                  key={med._id}
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseEnter={() => setActive(i)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition ${
                    i === activeIndex ? 'bg-emerald-50/80 dark:bg-emerald-950/30' : ''
                  } ${out ? 'opacity-50' : ''}`}
                >
                  <button
                    type="button"
                    disabled={out}
                    onClick={() => onAdd(med)}
                    className="flex-1 min-w-0 text-left cursor-pointer disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">{med.name}</span>
                      {med.requiresPrescription && (
                        <span className="text-[10px] px-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/50 font-bold">Rx</span>
                      )}
                      {med.isControlled && (
                        <span className="text-[10px] px-1.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/50 font-bold">CD</span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {[med.genericName, med.dosageForm, med.strength].filter(Boolean).join(' • ')}
                    </div>
                  </button>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">{formatMoney(med.price)}</div>
                    <div className={`text-[10px] font-mono ${out ? 'text-rose-500' : 'text-slate-500 dark:text-slate-400'}`}>
                      {out ? t('common:status.outOfStock') : `${available} ${med.baseUnit || t('unit')}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={out}
                      onClick={() => onAdd(med)}
                      title={t('search.addOne', { unit: med.baseUnit || t('unit') })}
                      className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:bg-slate-300 dark:disabled:bg-slate-700 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    {packs.map((u) => (
                      <button
                        key={u.name}
                        type="button"
                        disabled={available < u.factor}
                        onClick={() => onAdd(med, u)}
                        title={t('search.addPack', { unit: u.name, factor: u.factor, price: formatMoney(u.price) })}
                        className="px-1.5 py-1 rounded-lg text-[10px] font-semibold border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-40 cursor-pointer"
                      >
                        +{u.name}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ProductSearch;
