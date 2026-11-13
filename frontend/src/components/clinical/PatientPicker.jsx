import { useEffect, useRef, useState } from 'react';
import { Search, X, UserPlus, User, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getPatients } from '../../api/clinicalApi';
import { useAuth } from '../../context/AuthContext';
import PatientFormModal from './PatientFormModal';
import { inputCls, severityCls, patientAge } from './ui';

/**
 * Searchable patient selector (used by the POS and the prescription flow).
 * Props:
 *   value: selected patient object ({ _id, name, phone, allergies, ... }) or null
 *   onChange(patient | null): called when a patient is picked, created or cleared
 *   allowCreate (default true): shows "New patient" (needs patient:manage)
 *   disabled (default false)
 *   placeholder (optional)
 * Needs the `patient:view` permission (search uses GET /api/patients).
 */
const PatientPicker = ({ value, onChange, allowCreate = true, disabled = false, placeholder }) => {
  const { t } = useTranslation('patients');
  const { can } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await getPatients({ search: query || undefined, limit: 10 });
        if (!cancelled) setResults(data.patients || []);
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
  }, [query, open]);

  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (p) => {
    onChange?.(p);
    setOpen(false);
    setQuery('');
  };

  if (value) {
    const age = patientAge(value);
    return (
      <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <User className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{value.name}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {[age !== null && age !== undefined ? t('picker.ageYears', { age }) : null, value.sex !== 'unknown' ? t(`sex.${value.sex}`, { defaultValue: value.sex }) : null, value.phone]
                  .filter(Boolean)
                  .join(' · ') || t('picker.noDetails')}
              </p>
            </div>
          </div>
          {!disabled && (
            <button type="button" onClick={() => onChange?.(null)} className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer" title={t('picker.clear')}>
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {value.allergies?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
            {value.allergies.map((a, i) => (
              <span key={a._id || i} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${severityCls(a.severity)}`}>
                {a.substance}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={boxRef}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={query}
            disabled={disabled}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            placeholder={placeholder || t('picker.searchPlaceholder')}
            className={`${inputCls} pl-9`}
          />
        </div>
        {allowCreate && can('patient:manage') && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setCreating(true)}
            title={t('picker.newPatient')}
            className="px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-emerald-600 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-40 mt-1 w-full max-h-64 overflow-y-auto bg-white dark:bg-[#1b2230] border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl">
          {loading && <p className="p-3 text-[11px] text-slate-400">{t('picker.searching')}</p>}
          {!loading && results.length === 0 && <p className="p-3 text-[11px] text-slate-400">{t('picker.noResults')}</p>}
          {!loading &&
            results.map((p) => (
              <button
                type="button"
                key={p._id}
                onClick={() => pick(p)}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
              >
                <span className="text-xs font-semibold text-slate-900 dark:text-white">{p.name}</span>
                <span className="text-[11px] text-slate-500 ml-2">{p.phone}</span>
                {p.allergies?.length > 0 && (
                  <span className="ml-2 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                    {t('picker.allergyCount', { count: p.allergies.length })}
                  </span>
                )}
              </button>
            ))}
        </div>
      )}

      {creating && (
        <PatientFormModal
          isOpen
          onClose={() => setCreating(false)}
          onSaved={(p) => pick(p)}
        />
      )}
    </div>
  );
};

export default PatientPicker;
