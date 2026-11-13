import { useEffect, useRef, useState } from 'react';
import { Search, UserPlus, X, User, Phone, Wallet } from 'lucide-react';
import { getCustomers, createCustomer } from '../../api/customerApi';
import { useAuth } from '../../context/AuthContext';
import { formatMoney } from '../../utils/format';
import { inputCls, sectionCls, labelCls, errMsg } from './posUtils';

/**
 * Customer picker (#6): search existing customers, quick-create (customer:manage),
 * or type a walk-in name/phone. Shows the account balance and credit limit.
 * Props: { customer, onChange(customer|null), walkIn: { name, phone }, onWalkIn(next), online }
 */
const CustomerSection = ({ customer, onChange, walkIn, onWalkIn, online }) => {
  const { can } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [error, setError] = useState('');
  const boxRef = useRef(null);
  const canView = can('customer:view');
  const canCreate = can('customer:manage');

  useEffect(() => {
    if (!open || !online || !canView) return undefined;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const data = await getCustomers({ search: query || undefined, active: true, limit: 8 });
        if (!cancelled) setResults(data.customers || []);
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open, online, canView]);

  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const create = async () => {
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    setError('');
    try {
      const res = await createCustomer({ name: form.name.trim(), phone: form.phone.trim() || undefined });
      onChange(res.customer);
      setCreating(false);
      setForm({ name: '', phone: '' });
    } catch (err) {
      setError(errMsg(err, 'Could not create the customer'));
    }
  };

  if (customer) {
    const limit = customer.creditLimit;
    const available = limit === null || limit === undefined ? null : Math.max(0, limit - (customer.balance || 0));
    return (
      <div className={sectionCls}>
        <div className="flex items-center justify-between">
          <span className={labelCls}>Customer</span>
          <button type="button" onClick={() => onChange(null)} className="text-slate-400 hover:text-rose-500 cursor-pointer" title="Remove customer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-emerald-600" />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">{customer.name}</div>
            {customer.phone && <div className="text-[11px] text-slate-500 font-mono">{customer.phone}</div>}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1">
            <Wallet className="w-3 h-3" /> Balance <b className="font-mono">{formatMoney(customer.balance || 0)}</b>
          </span>
          <span>
            Limit{' '}
            <b className="font-mono">{limit === null || limit === undefined ? 'Unlimited' : formatMoney(limit)}</b>
          </span>
          {available !== null && (
            <span>
              Available <b className="font-mono">{formatMoney(available)}</b>
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={sectionCls} ref={boxRef}>
      <div className="flex items-center justify-between">
        <span className={labelCls}>Customer</span>
        {canCreate && online && !creating && (
          <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-500 cursor-pointer">
            <UserPlus className="w-3 h-3" /> New
          </button>
        )}
      </div>

      {creating ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Name *" className={inputCls} autoFocus />
            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone" className={`${inputCls} font-mono`} />
          </div>
          {error && <p className="text-[11px] text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreating(false)} className="text-[11px] text-slate-500 cursor-pointer">Cancel</button>
            <button type="button" onClick={create} className="text-[11px] font-semibold text-emerald-600 cursor-pointer">Create & select</button>
          </div>
        </div>
      ) : (
        <>
          {canView && online && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                placeholder="Find customer account…"
                className={`${inputCls} pl-8`}
              />
              {open && results.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg">
                  {results.map((c) => (
                    <li key={c._id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(c);
                          setOpen(false);
                          setQuery('');
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <div className="text-xs font-semibold text-slate-900 dark:text-white">{c.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {c.phone || '—'} · bal {formatMoney(c.balance || 0)}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                value={walkIn.name}
                onChange={(e) => onWalkIn({ ...walkIn, name: e.target.value })}
                placeholder="Walk-in name"
                className={`${inputCls} pl-8`}
              />
            </div>
            <div className="relative">
              <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                value={walkIn.phone}
                onChange={(e) => onWalkIn({ ...walkIn, phone: e.target.value })}
                placeholder="Phone"
                className={`${inputCls} pl-8 font-mono`}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CustomerSection;
