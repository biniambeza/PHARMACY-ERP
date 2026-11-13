import { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ROLE_LABELS } from '../../config/permissions';

// Lets a user who works in several branches pick the active one.
// Hidden when the user has a single branch.
const BranchSwitcher = () => {
  const { pharmacies, activePharmacyId, switchPharmacy } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!pharmacies || pharmacies.length <= 1) return null;

  const active = pharmacies.find((m) => String(m.pharmacyId) === String(activePharmacyId)) || pharmacies[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Switch branch"
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-full text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-emerald-400 transition cursor-pointer max-w-[200px]"
      >
        <Building2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span className="truncate">{active?.pharmacy?.name || 'Branch'}</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 mt-2 w-64 max-h-80 overflow-y-auto bg-white dark:bg-[#161c26] border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 py-1"
        >
          {pharmacies.map((m) => {
            const isActive = String(m.pharmacyId) === String(active?.pharmacyId);
            const blocked = m.pharmacy?.status !== 'active';
            return (
              <li key={m.pharmacyId}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  disabled={blocked}
                  onClick={() => {
                    setOpen(false);
                    if (!isActive) switchPharmacy(m.pharmacyId);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs transition ${
                    blocked
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer'
                  }`}
                >
                  <span className="w-4 shrink-0">
                    {isActive && <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-slate-900 dark:text-white truncate">
                      {m.pharmacy?.name}
                    </span>
                    <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                      {ROLE_LABELS[m.role] || m.role}
                      {blocked ? ` · ${m.pharmacy?.status}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default BranchSwitcher;
