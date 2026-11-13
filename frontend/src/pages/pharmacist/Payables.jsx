import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Wallet, Plus, X, AlertCircle, CheckCircle, FileText, Clock, Building2, Trash2 } from 'lucide-react';
import {
  getSupplierInvoices,
  createSupplierInvoice,
  deleteSupplierInvoice,
  recordSupplierPayment,
  getSupplierPayments,
  getPayableBalances,
  getPayablesAging,
} from '../../api/payableApi';
import { getSuppliers } from '../../api/supplierApi';
import Can from '../../components/common/Can';
import { useAuth } from '../../context/AuthContext';
import { CardSkeleton } from '../../components/common/SkeletonLoader';
import { formatMoney, formatDate } from '../../utils/format';

const inputCls =
  'w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition';
const labelCls = 'block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1';
const cardCls =
  'bg-white dark:bg-[#161c26] border border-slate-100/90 dark:border-slate-800/80 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.04)]';
const btnPrimary =
  'inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer';
const btnGhost =
  'px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold rounded-xl transition cursor-pointer';
const thCls = 'py-3 px-4';

const METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
];
const AP_BUCKETS = ['current', '1-30', '31-60', '61-90', '90+'];

const errMsg = (err, fallback) => err?.response?.data?.message || fallback;
const balanceOf = (inv) => Math.max(0, Math.round(((inv.amount || 0) - (inv.amountPaid || 0)) * 100) / 100);
const isOverdue = (inv) => inv.status !== 'paid' && new Date(inv.dueDate) < new Date();
const today = () => new Date().toISOString().slice(0, 10);

const Modal = ({ title, subtitle, icon: Icon, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
    <div className="bg-white dark:bg-[#161c26] border border-slate-200/90 dark:border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800/80 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

const ErrorBox = ({ error }) =>
  error ? (
    <div className="p-3 mb-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
      <span>{error}</span>
    </div>
  ) : null;

const InvoiceModal = ({ suppliers, defaultSupplierId, onClose, onSaved }) => {
  const [form, setForm] = useState({
    supplierId: defaultSupplierId || '',
    invoiceNo: '',
    invoiceDate: today(),
    dueDate: '',
    amount: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const supplier = suppliers.find((s) => s._id === form.supplierId);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.supplierId) return setError('Choose a supplier.');
    if (!form.invoiceNo.trim()) return setError('Invoice number is required.');
    if (!(Number(form.amount) > 0)) return setError('Enter a positive amount.');
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, amount: Number(form.amount) };
      if (!payload.dueDate) delete payload.dueDate;
      await createSupplierInvoice(payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(errMsg(err, 'Failed to save invoice'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Record Supplier Invoice" subtitle="A bill received from a supplier" icon={FileText} onClose={onClose}>
      <ErrorBox error={error} />
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls}>Supplier</label>
          <select className={inputCls} value={form.supplierId} onChange={set('supplierId')}>
            <option value="">Select supplier...</option>
            {suppliers.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Invoice number</label>
            <input className={inputCls} value={form.invoiceNo} onChange={set('invoiceNo')} />
          </div>
          <div>
            <label className={labelCls}>Amount</label>
            <input type="number" min="0.01" step="0.01" className={inputCls} value={form.amount} onChange={set('amount')} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Invoice date</label>
            <input type="date" className={inputCls} value={form.invoiceDate} onChange={set('invoiceDate')} />
          </div>
          <div>
            <label className={labelCls}>Due date</label>
            <input type="date" className={inputCls} value={form.dueDate} onChange={set('dueDate')} />
            <p className="text-[10px] text-slate-400 mt-1">
              Leave empty to use the supplier terms{supplier ? ` (${supplier.paymentTermsDays ?? 30} days)` : ''}.
            </p>
          </div>
        </div>
        <div>
          <label className={labelCls}>Notes</label>
          <input className={inputCls} value={form.notes} onChange={set('notes')} />
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/80">
          <button type="button" onClick={onClose} className={btnGhost}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={btnPrimary}>
            <CheckCircle className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Invoice'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

// `target` = { supplierId, supplierName, outstanding, invoice? }
const PaymentModal = ({ target, onClose, onSaved }) => {
  const [amount, setAmount] = useState(String(target.invoice ? balanceOf(target.invoice) : target.outstanding || ''));
  const [method, setMethod] = useState('bank_transfer');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const n = Number(amount);
    if (!(n > 0)) return setError('Enter a positive amount.');
    setSaving(true);
    setError('');
    try {
      const payload = { supplierId: target.supplierId, amount: n, method, reference, note, date };
      if (target.invoice) {
        payload.allocations = [{ invoiceId: target.invoice._id, amount: Math.min(n, balanceOf(target.invoice)) }];
      }
      await recordSupplierPayment(payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(errMsg(err, 'Failed to record payment'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Pay Supplier"
      subtitle={`${target.supplierName}${target.invoice ? ` - invoice ${target.invoice.invoiceNo}` : ''} - outstanding ${formatMoney(
        target.outstanding
      )}`}
      icon={Wallet}
      onClose={onClose}
    >
      <ErrorBox error={error} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Amount</label>
            <input type="number" min="0.01" step="0.01" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Method</label>
            <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Reference</label>
            <input className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transfer / cheque no." />
          </div>
          <div>
            <label className={labelCls}>Payment date</label>
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Note</label>
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {target.invoice
            ? 'Applied to this invoice first; any remainder goes to the oldest due invoices.'
            : 'Applied to the oldest due invoices first.'}
        </p>
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/80">
          <button type="button" onClick={onClose} className={btnGhost}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={btnPrimary}>
            <CheckCircle className="w-4 h-4" /> {saving ? 'Saving...' : 'Record Payment'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const Payables = () => {
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
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const outstandingFor = (supplierId) =>
    balances.balances.find((b) => String(b.supplierId) === String(supplierId))?.outstanding || 0;
  const supplierName = (id) => suppliers.find((s) => s._id === id)?.name || '';

  const handleDelete = async (inv) => {
    if (!window.confirm(`Delete invoice ${inv.invoiceNo}?`)) return;
    try {
      await deleteSupplierInvoice(inv._id);
      load();
    } catch (err) {
      alert(errMsg(err, 'Failed to delete invoice'));
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
            Accounts Payable
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">Supplier Payables</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Supplier invoices, due dates and payments</p>
        </div>
        <Can perm="supplier:pay">
          <button onClick={() => setShowInvoice(true)} className={`${btnPrimary} self-start sm:self-auto`}>
            <Plus className="w-4 h-4" /> Record Invoice
          </button>
        </Can>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        <div className={`${cardCls} p-5`}>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Wallet className="w-4 h-4 text-emerald-600" /> Total payable
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{formatMoney(balances.totals.outstanding)}</p>
          <p className="text-[11px] mt-1 text-rose-600 dark:text-rose-400 font-semibold">
            {formatMoney(balances.totals.overdue)} overdue
          </p>
        </div>
        <div className={`${cardCls} p-5 lg:col-span-2`}>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Clock className="w-4 h-4 text-amber-500" /> Aging (days past due)
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
                  {b === 'current' ? 'Not yet due' : `${b} days`}
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{formatMoney(aging?.totals?.[b] || 0)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={`${cardCls} p-4 flex flex-col md:flex-row md:items-center justify-between gap-3`}>
        <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-medium self-start">
          {tabBtn('invoices', 'Invoices')}
          {tabBtn('balances', 'Supplier balances')}
          {tabBtn('payments', 'Payments')}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={`${inputCls} w-auto`}
            value={supplierFilter}
            onChange={(e) => setSearchParams(e.target.value ? { supplierId: e.target.value } : {})}
          >
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
          {tab === 'invoices' && (
            <select className={`${inputCls} w-auto`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="unpaid">Unpaid</option>
              <option value="overdue">Overdue</option>
              <option value="paid">Paid</option>
              <option value="">All</option>
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
            invoices.length === 0 ? (
              <p className="py-16 text-center text-xs text-slate-500">No invoices match this filter.</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/75 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className={thCls}>Invoice</th>
                    <th className={thCls}>Supplier</th>
                    <th className={thCls}>Date</th>
                    <th className={thCls}>Due</th>
                    <th className={`${thCls} text-right`}>Amount</th>
                    <th className={`${thCls} text-right`}>Paid</th>
                    <th className={`${thCls} text-right`}>Balance</th>
                    <th className={thCls}>Status</th>
                    <th className={`${thCls} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                  {invoices.map((inv) => {
                    const overdue = isOverdue(inv);
                    const sid = inv.supplierId?._id || inv.supplierId;
                    return (
                      <tr key={inv._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-slate-900 dark:text-white">{inv.invoiceNo}</span>
                          {inv.purchaseOrderId?.poNumber && (
                            <span className="block text-[10px] text-slate-400">PO {inv.purchaseOrderId.poNumber}</span>
                          )}
                        </td>
                        <td className="py-3 px-4">{inv.supplierId?.name || supplierName(sid)}</td>
                        <td className="py-3 px-4 whitespace-nowrap">{formatDate(inv.invoiceDate)}</td>
                        <td className={`py-3 px-4 whitespace-nowrap ${overdue ? 'text-rose-600 dark:text-rose-400 font-semibold' : ''}`}>
                          {formatDate(inv.dueDate)}
                        </td>
                        <td className="py-3 px-4 text-right">{formatMoney(inv.amount)}</td>
                        <td className="py-3 px-4 text-right">{formatMoney(inv.amountPaid)}</td>
                        <td className="py-3 px-4 text-right font-bold">{formatMoney(balanceOf(inv))}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded-full border capitalize ${
                              inv.status === 'paid'
                                ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800'
                                : overdue
                                  ? 'text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-950/40 dark:border-rose-800'
                                  : 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-800'
                            }`}
                          >
                            {inv.status !== 'paid' && overdue ? 'overdue' : inv.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {can('supplier:pay') && inv.status !== 'paid' && (
                              <button
                                onClick={() =>
                                  setPayTarget({
                                    supplierId: sid,
                                    supplierName: inv.supplierId?.name || supplierName(sid),
                                    outstanding: outstandingFor(sid),
                                    invoice: inv,
                                  })
                                }
                                className="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg cursor-pointer"
                              >
                                Pay
                              </button>
                            )}
                            {can('supplier:pay') && !(inv.amountPaid > 0) && (
                              <button
                                onClick={() => handleDelete(inv)}
                                title="Delete invoice"
                                className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          ) : tab === 'balances' ? (
            balances.balances.length === 0 ? (
              <p className="py-16 text-center text-xs text-slate-500">Nothing owed to suppliers.</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/75 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className={thCls}>Supplier</th>
                    <th className={thCls}>Terms</th>
                    <th className={`${thCls} text-right`}>Open invoices</th>
                    <th className={thCls}>Next due</th>
                    <th className={`${thCls} text-right`}>Overdue</th>
                    <th className={`${thCls} text-right`}>Outstanding</th>
                    <th className={`${thCls} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                  {balances.balances.map((b) => (
                    <tr key={b.supplierId}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                          <Building2 className="w-4 h-4 text-emerald-600" /> {b.name}
                        </div>
                      </td>
                      <td className="py-3 px-4">{b.paymentTermsDays ?? 30} days</td>
                      <td className="py-3 px-4 text-right">{b.openInvoices}</td>
                      <td className="py-3 px-4">{formatDate(b.nextDue)}</td>
                      <td className={`py-3 px-4 text-right ${b.overdue > 0 ? 'text-rose-600 dark:text-rose-400 font-semibold' : ''}`}>
                        {formatMoney(b.overdue)}
                      </td>
                      <td className="py-3 px-4 text-right font-bold">{formatMoney(b.outstanding)}</td>
                      <td className="py-3 px-4 text-right">
                        <Can perm="supplier:pay">
                          <button
                            onClick={() =>
                              setPayTarget({ supplierId: b.supplierId, supplierName: b.name, outstanding: b.outstanding })
                            }
                            className="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg cursor-pointer"
                          >
                            Pay
                          </button>
                        </Can>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : payments.length === 0 ? (
            <p className="py-16 text-center text-xs text-slate-500">No supplier payments yet.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className={thCls}>Payment</th>
                  <th className={thCls}>Date</th>
                  <th className={thCls}>Supplier</th>
                  <th className={thCls}>Method</th>
                  <th className={thCls}>Applied to</th>
                  <th className={`${thCls} text-right`}>Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                {payments.map((p) => (
                  <tr key={p._id}>
                    <td className="py-3 px-4 font-mono">
                      {p.paymentNo}
                      {p.reference && <span className="block text-[10px] text-slate-400">{p.reference}</span>}
                    </td>
                    <td className="py-3 px-4">{formatDate(p.date)}</td>
                    <td className="py-3 px-4">{p.supplierId?.name}</td>
                    <td className="py-3 px-4 capitalize">{String(p.method).replace('_', ' ')}</td>
                    <td className="py-3 px-4 text-[11px] text-slate-500">
                      {p.allocations.map((a) => `${a.invoiceNo} (${formatMoney(a.amount)})`).join(', ')}
                    </td>
                    <td className="py-3 px-4 text-right font-bold">{formatMoney(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
