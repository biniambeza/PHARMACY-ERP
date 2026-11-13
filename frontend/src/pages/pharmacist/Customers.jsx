import { useState, useEffect, useCallback } from 'react';
import { Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getCustomers, deleteCustomer, getReceivablesAging } from '../../api/customerApi';
import Can from '../../components/common/Can';
import CustomerFormModal from '../../components/customers/CustomerFormModal';
import CustomerPaymentModal from '../../components/customers/CustomerPaymentModal';
import CustomerStatementModal from '../../components/customers/CustomerStatementModal';
import CustomersTable from '../../components/customers/CustomersTable';
import { ReceivablesSummary, AgingByCustomer } from '../../components/customers/ReceivablesSummary';
import { inputCls, cardCls, btnPrimary, errMsg } from '../../components/customers/customerUi';
import { logApiError } from '../../api/logApiError';

const FILTERS = [
  ['', 'filters.all'],
  ['balance', 'filters.withBalance'],
  ['active', 'common:status.active'],
  ['inactive', 'common:status.inactive'],
];

// ---------- Page ----------
const Customers = () => {
  const { t } = useTranslation('customers');
  const [customers, setCustomers] = useState([]);
  const [summary, setSummary] = useState({ receivable: 0, withBalance: 0, active: 0 });
  const [aging, setAging] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new
  const [paying, setPaying] = useState(null);
  const [statementFor, setStatementFor] = useState(null);

  const load = useCallback(async () => {
    try {
      const params = {};
      if (search) params.search = search;
      if (filter === 'balance') params.hasBalance = 'true';
      if (filter === 'inactive') params.active = 'false';
      if (filter === 'active') params.active = 'true';
      const [list, ag] = await Promise.all([getCustomers(params), getReceivablesAging()]);
      setCustomers(list.customers || []);
      setSummary(list.summary || { receivable: 0, withBalance: 0, active: 0 });
      setAging(ag);
    } catch (err) {
      logApiError('Failed to load customers', err);
    } finally {
      setLoading(false);
    }
  }, [search, filter]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const handleDelete = async (c) => {
    if (!window.confirm(t('confirmRemove', { name: c.name }))) return;
    try {
      const res = await deleteCustomer(c._id);
      if (res?.archived) alert(res.message);
      load();
    } catch (err) {
      alert(errMsg(err, t('removeFailed')));
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 uppercase tracking-wider">
            {t('badge')}
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">{t('title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('subtitle')}</p>
        </div>
        <Can perm="customer:manage">
          <button onClick={() => setEditing(null)} className={`${btnPrimary} self-start sm:self-auto`}>
            <Plus className="w-4 h-4" /> {t('newCustomer')}
          </button>
        </Can>
      </div>

      {/* Summary + aging */}
      <ReceivablesSummary summary={summary} aging={aging} />

      {/* Filters */}
      <div className={`${cardCls} p-4 sm:p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4`}>
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className={`${inputCls} pl-9`}
          />
        </div>
        <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-medium">
          {FILTERS.map(([v, l]) => (
            <button
              key={v || 'all'}
              onClick={() => setFilter(v)}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
                filter === v
                  ? 'bg-white dark:bg-[#161c26] text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t(l)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <CustomersTable
        customers={customers}
        loading={loading}
        filtered={Boolean(search || filter)}
        onPay={setPaying}
        onStatement={setStatementFor}
        onEdit={setEditing}
        onDelete={handleDelete}
      />

      {/* Aging by customer */}
      <AgingByCustomer aging={aging} />

      {editing !== undefined && (
        <CustomerFormModal customer={editing} onClose={() => setEditing(undefined)} onSaved={load} />
      )}
      {paying && <CustomerPaymentModal customer={paying} onClose={() => setPaying(null)} onSaved={load} />}
      {statementFor && <CustomerStatementModal customer={statementFor} onClose={() => setStatementFor(null)} />}
    </div>
  );
};

export default Customers;
