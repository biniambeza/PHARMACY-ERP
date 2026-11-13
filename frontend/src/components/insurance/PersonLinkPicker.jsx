import { useEffect, useId, useRef, useState } from 'react';
import { Search, X, User, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getPatients } from '../../api/clinicalApi';
import { getCustomers } from '../../api/customerApi';
import { inputCls, labelCls } from './insuranceUi';

const SOURCES = {
  patient: {
    icon: User,
    search: async (q) => (await getPatients({ search: q || undefined, limit: 8 })).patients || [],
  },
  customer: {
    icon: Users,
    search: async (q) => (await getCustomers({ search: q || undefined, active: true, limit: 8 })).customers || [],
  },
};

// Searchable picker that links an existing patient or customer to an insurance member.
// Uses the same list endpoints as the POS / clinical pages (GET /api/patients, GET /api/customers).
// Props:
//   kind: 'patient' | 'customer'
//   value: { _id, name, phone } | null   (an id without details is shown as "linked record")
//   onChange(record | null)
const PersonLinkPicker = ({ kind, value, onChange, disabled = false }) => {
  const { t } = useTranslation('insurance');
  const source = SOURCES[kind];
  const Icon = source.icon;
  const inputId = useId();
  const listId = `${inputId}-list`;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const list = await source.search(query.trim());
        if (!cancelled) {
          setResults(list);
          setActive(-1);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open, source]);

  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (rec) => {
    onChange(rec);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(results[active]);
    }
  };

  const label = t(`members.link.${kind}`);

  if (value) {
    return (
      <div>
        <span className={labelCls}>{label}</span>
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2 min-w-0">
            <Icon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{value.name || t('members.link.linked')}</p>
              {value.phone && <p className="text-[11px] text-slate-500 dark:text-slate-400">{value.phone}</p>}
            </div>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
              title={t('members.link.clear')}
              aria-label={`${t('members.link.clear')}: ${value.name || label}`}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={boxRef}>
      <label htmlFor={inputId} className={labelCls}>{label}</label>
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" aria-hidden="true" />
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 && results[active] ? `${listId}-${results[active]._id}` : undefined}
          autoComplete="off"
          value={query}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder={t(`members.link.search_${kind}`)}
          className={`${inputCls} pl-9`}
        />
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-40 mt-1 w-full max-h-56 overflow-y-auto bg-white dark:bg-[#1b2230] border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl"
        >
          {loading && <li className="p-3 text-[11px] text-slate-400">{t('members.link.searching')}</li>}
          {!loading && results.length === 0 && <li className="p-3 text-[11px] text-slate-400">{t('members.link.noResults')}</li>}
          {!loading &&
            results.map((r, i) => (
              <li
                key={r._id}
                id={`${listId}-${r._id}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(r)}
                className={`px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 ${i === active ? 'bg-slate-50 dark:bg-slate-800/60' : ''}`}
              >
                <span className="text-xs font-semibold text-slate-900 dark:text-white">{r.name}</span>
                {r.phone && <span className="text-[11px] text-slate-500 ml-2">{r.phone}</span>}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
};

export default PersonLinkPicker;
