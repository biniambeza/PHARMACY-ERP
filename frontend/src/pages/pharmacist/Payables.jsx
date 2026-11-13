import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Wallet, Plus, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  getSupplierInvoices,
  deleteSupplierInvoice,
  getSupplierPayments,
  getPayableBalances,
  getPayablesAging,
} from '../../api/payableApi';
import { getSuppliers } from '../../api/supplierApi';
import Can from '../../components/common/Can';
import { useAuth } from '../../context/AuthContext';
import { CardSkeleton } from '../../components/common/SkeletonLoader';
import { formatMoney } from '../../utils/format';
import { inputCls, cardCls, btnPrimary, AP_BUCKETS, errMsg } from '../../components/payables/payablesUtils';
import InvoiceModal from '../../components/payables/InvoiceModal';
import PaymentModal from '../../components/payables/PaymentModal';
import InvoicesTable from '../../components/payables/InvoicesTable';
import BalancesTable from '../../components/payables/BalancesTable';
import PaymentsTable from '../../components/payables/PaymentsTable';

const Payables = () => {
  const { t } = useTranslation('payables');
  const { can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const supplierFilter = searchParams.get('supplierId') || '';
  const [tab, setTab] = useState('invoices');
  const [statusFilter, setStatusFilter] = useState('unpaid');
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [balances, setBalances] = useState({ totals: { outstanding: 0, overdue: 0 }, balances: [] });
  const [aging, setAging] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvoice, setShowInvoice] = useState(false);
  const [payTarget, setPayTarget] = useState(null);

  const load = useCallback(async () => {
    try {
      const invParams = {};
      if (statusFilter === 'overdue') invParams.overdue = 'true';
      else if (statusFilter) invParams.status = statusFilter;
      if (supplierFilter) invParams.supplierId = supplierFilter;
      const payParams = supplierFilter ? { supplierId: supplierFilter } : {};
      const [inv, pay, bal, ag, sup] = await Promise.all([
        getSupplierInvoices(invParams),
        getSupplierPayments(payParams),
        getPayableBalances(),
        getPayablesAging(),
        getSuppliers(),
      ]);
      setInvoices(inv.invoices || []);
      setPayments(pay.payments || []);
      setBalances(bal);
      setAging(ag);
      setSuppliers(sup.suppliers || []);
    } catch (err) {
      console.error('Failed to load payables:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, supplierFilter]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const outstandingFor = (supplierId) =>
    balances.balances.find((b) => String(b.supplierId) === String(supplierId))?.outstanding || 0;
  const supplierName = (id) => suppliers.find((s) => s._id === id)?.name || '';

  const handleDelete = async (inv) => {
    if (!window.confirm(t('confirmDeleteInvoice', { invoiceNo: inv.invoiceNo }))) return;
    try {
      await deleteSupplierInvoice(inv._id);
      load();
    } catch (err) {
      alert(errMsg(err, t('errors.deleteInvoice')));
    }
  };

  const tabBtn = (v, l) => (
    <button
      key={v}
      onClick={() => setTab(v)}
      className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
        tab === v
          ? 'bg-white dark:bg-[#161c26] text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
      }`}
    >
      {l}
    </button>
  );

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
        <Can perm="supplier:pay">
          <button onClick={() => setShowInvoice(true)} className={`${btnPrimary} self-start sm:self-auto`}>
            <Plus className="w-4 h-4" /> {t('recordInvoice')}
          </button>
        </Can>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        <div className={`${cardCls} p-5`}>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Wallet className="w-4 h-4 text-emerald-600" /> {t('totalPayable')}
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{formatMoney(balances.totals.outstanding)}</p>
          <p className="text-[11px] mt-1 text-rose-600 dark:text-rose-400 font-semibold">
            {t('overdueAmount', { amount: formatMoney(balances.totals.overdue) })}
          </p>
        </div>
        <div className={`${cardCls} p-5 lg:col-span-2`}>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Clock className="w-4 h-4 text-amber-500" /> {t('aging')}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3">
            {AP_BUCKETS.map((b, i) => (
              <div
                key={b}
                className={`rounded-xl p-3 border ${
                  i === 0
                    ? 'border-emerald-100 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20'
                    : i === 4
                      ? 'border-rose-100 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20'
                      : 'border-amber-100 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20'
                }`}
              >
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold capitalize">
                  {b === 'current' ? t('notYetDue') : t('bucketDays', { range: b })}
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{formatMoney(aging?.totals?.[b] || 0)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={`${cardCls} p-4 flex flex-col md:flex-row md:items-center justify-between gap-3`}>
        <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-medium self-start">
          {tabBtn('invoices', t('tabs.invoices'))}
          {tabBtn('balances', t('tabs.balances'))}
          {tabBtn('payments', t('tabs.payments'))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={`${inputCls} w-auto`}
            value={supplierFilter}
            onChange={(e) => setSearchParams(e.target.value ? { supplierId: e.target.value } : {})}
          >
            <option value="">{t('allSuppliers')}</option>
            {suppliers.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
          {tab === 'invoices' && (
            <select className={`${inputCls} w-auto`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="unpaid">{t('filters.unpaid')}</option>
              <option value="overdue">{t('filters.overdue')}</option>
              <option value="paid">{t('filters.paid')}</option>
              <option value="">{t('filters.all')}</option>
            </select>
          )}
        </div>
      </div>

      <div className={`${cardCls} overflow-hidden`}>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8">
              <CardSkeleton height="h-64" />
            </div>
          ) : tab === 'invoices' ? (
            <InvoicesTable
              invoices={invoices}
              canPay={can('supplier:pay')}
              supplierName={supplierName}
              outstandingFor={outstandingFor}
              onPay={setPayTarget}
              onDelete={handleDelete}
            />
          ) : tab === 'balances' ? (
            <BalancesTable balances={balances.balances} onPay={setPayTarget} />
          ) : (
            <PaymentsTable payments={payments} />
          )}
        </div>
      </div>

      {showInvoice && (
        <InvoiceModal
          suppliers={suppliers}
          defaultSupplierId={supplierFilter}
          onClose={() => setShowInvoice(false)}
          onSaved={load}
        />
      )}
      {payTarget && <PaymentModal target={payTarget} onClose={() => setPayTarget(null)} onSaved={load} />}
    </div>
  );
};

export default Payables;
