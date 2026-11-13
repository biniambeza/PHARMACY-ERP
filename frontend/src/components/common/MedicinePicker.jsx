import { useEffect, useId, useRef, useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { searchMedicines } from '../../api/medicineApi';

const RESULT_LIMIT = 20;
const DEBOUNCE_MS = 250;

const defaultInputCls =
  'w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition';

const medicineLabel = (m) =>
  m ? [m.name, m.strength, m.dosageForm ? `(${m.dosageForm})` : ''].filter(Boolean).join(' ') : '';

// Debounced typeahead for choosing a medicine from the catalog. Searches the server
// (GET /api/medicines?q=&fields=picker), so it works with catalogs of any size.
// Props:
//   value            selected medicine object ({ _id, name, ... }) or null
//   onChange(med)    called with the picked medicine (light projection) or null when cleared
//   placeholder      input placeholder (defaults to a generic "Search medicines...")
//   ariaLabel        accessible name when there is no visible <label htmlFor={id}>
//   id               input id (for an external <label>)
//   includeArchived  also offer archived medicines (e.g. for history filters)
//   clearable        show a clear button when a value is selected (default true)
//   keepValue        keep showing the picked medicine in the input (default true); false resets
//                    the box after each pick (for "add a line" pickers)
//   renderMeta(med)  optional extra text shown on the right of each result
//   inputClassName   classes for the input (defaults to the catalog input style)
const MedicinePicker = ({
  value = null,
  onChange,
  placeholder,
  ariaLabel,
  id,
  includeArchived = false,
  clearable = true,
  keepValue = true,
  disabled = false,
  required = false,
  renderMeta,
  inputClassName = defaultInputCls,
}) => {
  const { t } = useTranslation('common');
  const autoId = useId();
  const inputId = id || autoId;
  const listId = `${inputId}-list`;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchMedicines(query.trim(), { limit: RESULT_LIMIT, includeArchived });
        if (!cancelled) {
          setResults(res.medicines || []);
          setTotal(res.total || 0);
          setFailed(false);
          setActive(-1);
        }
      } catch {
        if (!cancelled) {
          setResults([]);
          setTotal(0);
          setFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open, includeArchived]);

  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (med) => {
    onChange(med);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown' && !open) {
      setOpen(true);
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(results[active >= 0 ? active : 0]);
    }
  };

  const shownValue = open ? query : keepValue && value ? medicineLabel(value) : '';
  const showClear = clearable && keepValue && value && !disabled;

  return (
    <div className="relative" ref={boxRef}>
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" aria-hidden="true" />
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={ariaLabel}
          aria-activedescendant={active >= 0 && results[active] ? `${listId}-${results[active]._id}` : undefined}
          autoComplete="off"
          value={shownValue}
          disabled={disabled}
          required={required && !value}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder={keepValue && value ? medicineLabel(value) : placeholder || t('medicinePicker.placeholder')}
          className={`${inputClassName} pl-9 ${showClear ? 'pr-8' : ''}`}
        />
        {showClear && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute right-2 top-2 p-0.5 text-slate-400 hover:text-rose-600 cursor-pointer"
            title={t('medicinePicker.clear')}
            aria-label={t('medicinePicker.clear')}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel || placeholder || t('medicinePicker.placeholder')}
          className="absolute z-40 mt-1 w-full max-h-64 overflow-y-auto bg-white dark:bg-[#1b2230] border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl"
        >
          {loading && (
            <li className="p-3 text-[11px] text-slate-400 flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> {t('medicinePicker.searching')}
            </li>
          )}
          {!loading && failed && <li className="p-3 text-[11px] text-rose-500">{t('medicinePicker.failed')}</li>}
          {!loading && !failed && results.length === 0 && (
            <li className="p-3 text-[11px] text-slate-400">{t('medicinePicker.noResults')}</li>
          )}
          {!loading &&
            results.map((m, i) => (
              <li
                key={m._id}
                id={`${listId}-${m._id}`}
                role="option"
                aria-selected={i === active || (value && value._id === m._id)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(m)}
                className={`px-3 py-2 cursor-pointer flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                  i === active ? 'bg-slate-50 dark:bg-slate-800/60' : ''
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-slate-900 dark:text-white truncate">
                    {medicineLabel(m)}
                    {m.isArchived ? ` ${t('medicinePicker.archived')}` : ''}
                  </span>
                  {m.genericName && <span className="block text-[11px] text-slate-500 truncate">{m.genericName}</span>}
                </span>
                {renderMeta && <span className="text-[11px] text-slate-500 shrink-0">{renderMeta(m)}</span>}
              </li>
            ))}
          {!loading && total > results.length && (
            <li className="px-3 py-2 text-[10px] text-slate-400 border-t border-slate-100 dark:border-slate-800">
              {t('medicinePicker.moreResults', { shown: results.length, total })}
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

export default MedicinePicker;
