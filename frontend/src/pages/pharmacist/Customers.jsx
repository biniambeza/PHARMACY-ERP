import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Plus,
  Search,
  Edit3,
  Trash2,
  Wallet,
  FileText,
  X,
  AlertCircle,
  CheckCircle,
  Printer,
  Clock,
  CreditCard,
} from 'lucide-react';
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  recordCustomerPayment,
  getCustomerById,
  getCustomerStatement,
  getReceivablesAging,
} from '../../api/customerApi';
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

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];

const AGING_BUCKETS = ['0-30', '31-60', '61-90', '90+'];

const errMsg = (err, fallback) => err?.response?.data?.message || fallback;

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const limitLabel = (limit) => (limit === null || limit === undefined ? 'Unlimited' : limit === 0 ? 'No credit' : formatMoney(limit));

// ---------- Modal shell ----------
const Modal = ({ title, subtitle, icon: Icon, onClose, children, wide = false }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
    <div
      className={`bg-white dark:bg-[#161c26] border border-slate-200/90 dark:border-slate-800 rounded-2xl w-full ${
        wide ? 'max-w-4xl' : 'max-w-lg'
      } p-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar`}
    >
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

// ---------- Create / edit ----------
const CustomerFormModal = ({ customer, onClose, onSaved }) => {
  const [form, setForm] = useState(() => ({
    name: customer?.name || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    address: customer?.address || '',
    notes: customer?.notes || '',
    unlimited: customer ? customer.creditLimit === null : false,
    creditLimit: customer && customer.creditLimit !== null ? String(customer.creditLimit ?? 0) : '0',
    active: customer ? customer.active : true,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('Customer name is required.');
    const limit = form.unlimited ? null : Number(form.creditLimit || 0);
    if (limit !== null && (!Number.isFinite(limit) || limit < 0)) return setError('Credit limit must be 0 or more.');
    setSaving(true);
    setError('');
    const payload = {
      name: form.name,
      phone: form.phone,
      email: form.email,
      address: form.address,
      notes: form.notes,
      creditLimit: limit,
      active: form.active,
    };
    try {
      if (customer) await updateCustomer(customer._id, payload);
      else await createCustomer(payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(errMsg(err, 'Failed to save customer'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={customer ? 'Edit Customer' : 'New Credit Customer'}
      subtitle="Contact details and credit limit"
      icon={Users}
      onClose={onClose}
    >
      <ErrorBox error={error} />
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls}>
            Full name <span className="text-rose-500">*</span>
          </label>
          <input className={inputCls} value={form.name} onChange={set('name')} required />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Phone</label>
            <input className={inputCls} value={form.phone} onChange={set('phone')} placeholder="09..." />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input type="email" className={inputCls} value={form.email} onChange={set('email')} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Address</label>
          <input className={inputCls} value={form.address} onChange={set('address')} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
          <div>
            <label className={labelCls}>Credit limit</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputCls}
              value={form.creditLimit}
              onChange={set('creditLimit')}
              disabled={form.unlimited}
            />
            <p className="text-[10px] text-slate-400 mt-1">0 means no credit is allowed.</p>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 pb-5 cursor-pointer">
            <input type="checkbox" checked={form.unlimited} onChange={set('unlimited')} className="accent-emerald-600" />
            Unlimited credit
          </label>
        </div>
        <div>
          <label className={labelCls}>Notes</label>
          <textarea rows="2" className={inputCls} value={form.notes} onChange={set('notes')} />
        </div>
        {customer && (
          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={set('active')} className="accent-emerald-600" />
            Account active
          </label>
        )}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/80">
          <button type="button" onClick={onClose} className={btnGhost}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={btnPrimary}>
            <CheckCircle className="w-4 h-4" />
            {saving ? 'Saving...' : customer ? 'Save Changes' : 'Create Customer'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

// ---------- Record payment ----------
const PaymentModal = ({ customer, onClose, onSaved }) => {
  const [openSales, setOpenSales] = useState([]);
  const [amount, setAmount] = useState(String(Math.round((customer.balance || 0) * 100) / 100));
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getCustomerById(customer._id)
      .then((d) => setOpenSales(d.openSales || []))
      .catch(() => setOpenSales([]));
  }, [customer._id]);

  // Preview of the oldest-first allocation done by the server
  const preview = openSales.reduce(
    (acc, s) => {
      const a = Math.min(acc.left, s.balanceDue);
      return {
        left: Math.max(0, Math.round((acc.left - a) * 100) / 100),
        rows: [...acc.rows, { ...s, apply: Math.round(a * 100) / 100 }],
      };
    },
    { left: Number(amount) || 0, rows: [] }
  ).rows;

  const submit = async (e) => {
    e.preventDefault();
    const n = Number(amount);
    if (!(n > 0)) return setError('Enter a positive amount.');
    if (n > customer.balance + 0.005) return setError('Amount exceeds the outstanding balance.');
    setSaving(true);
    setError('');
    try {
      await recordCustomerPayment(customer._id, { amount: n, method, reference, note });
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
      title="Record Payment"
      subtitle={`${customer.name} owes ${formatMoney(customer.balance)}`}
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
              {PAYMENT_METHODS.map((m) => (
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
            <input className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Receipt / txn no." />
          </div>
          <div>
            <label className={labelCls}>Note</label>
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        {preview.length > 0 && (
          <div className="rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 dark:bg-slate-800/40">
              Applied to open invoices (oldest first)
            </div>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {preview.map((s) => (
                  <tr key={s._id}>
                    <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">{s.invoiceNumber}</td>
                    <td className="px-3 py-2 text-slate-500">{formatDate(s.createdAt)}</td>
                    <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400">{formatMoney(s.balanceDue)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                      {s.apply > 0 ? formatMoney(s.apply) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/80">
          <button type="button" onClick={onClose} className={btnGhost}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={btnPrimary}>
            <CheckCircle className="w-4 h-4" />
            {saving ? 'Saving...' : 'Record Payment'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

// ---------- Statement ----------
const StatementModal = ({ customer, onClose }) => {
  const { activePharmacy } = useAuth();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const params = {};
    if (from) params.from = from;
    if (to) params.to = to;
    getCustomerStatement(customer._id, params)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError('');
        }
      })
      .catch((err) => !cancelled && setError(errMsg(err, 'Failed to load statement')));
    return () => {
      cancelled = true;
    };
  }, [customer._id, from, to]);

  const print = () => {
    if (!data) return;
    const rows = data.entries
      .map(
        (e) => `<tr><td>${escapeHtml(formatDate(e.date))}</td><td>${escapeHtml(e.description)}</td><td>${escapeHtml(
          e.reference
        )}</td><td class="r">${e.debit ? escapeHtml(formatMoney(e.debit)) : ''}</td><td class="r">${
          e.credit ? escapeHtml(formatMoney(e.credit)) : ''
        }</td><td class="r">${escapeHtml(formatMoney(e.balance))}</td></tr>`
      )
      .join('');
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Statement - ${escapeHtml(customer.name)}</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:24px}h1{font-size:18px;margin:0}
table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left}
.r{text-align:right}.muted{color:#666}.tot td{font-weight:bold;border-top:2px solid #111}</style></head><body>
<h1>${escapeHtml(activePharmacy?.name || 'Pharmacy')}</h1>
<p class="muted">${escapeHtml(activePharmacy?.address || '')} ${escapeHtml(activePharmacy?.phone || '')}</p>
<h2 style="font-size:15px">Customer Statement</h2>
<p><strong>${escapeHtml(customer.name)}</strong> ${escapeHtml(customer.phone || '')}<br/>
<span class="muted">Period: ${escapeHtml(from ? formatDate(from) : 'Start')} - ${escapeHtml(to ? formatDate(to) : formatDate(new Date()))}</span></p>
<table><thead><tr><th>Date</th><th>Description</th><th>Reference</th><th class="r">Charges</th><th class="r">Payments</th><th class="r">Balance</th></tr></thead>
<tbody><tr><td></td><td>Opening balance</td><td></td><td></td><td></td><td class="r">${escapeHtml(formatMoney(data.openingBalance))}</td></tr>
${rows}<tr class="tot"><td></td><td>Closing balance</td><td></td><td class="r">${escapeHtml(formatMoney(data.totals.debit))}</td>
<td class="r">${escapeHtml(formatMoney(data.totals.credit))}</td><td class="r">${escapeHtml(formatMoney(data.closingBalance))}</td></tr></tbody></table>
<p class="muted" style="margin-top:24px">Printed ${escapeHtml(new Date().toLocaleString())}</p></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <Modal title="Customer Statement" subtitle={customer.name} icon={FileText} onClose={onClose} wide>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className={labelCls}>From</label>
          <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>To</label>
          <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button onClick={print} disabled={!data} className={`${btnPrimary} ml-auto`}>
          <Printer className="w-4 h-4" /> Print
        </button>
      </div>
      <ErrorBox error={error} />
      {!data ? (
        <CardSkeleton height="h-40" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50/75 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-3">Reference</th>
                <th className="py-2.5 px-3 text-right">Charges</th>
                <th className="py-2.5 px-3 text-right">Payments</th>
                <th className="py-2.5 px-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              <tr className="text-slate-500">
                <td className="py-2 px-3" />
                <td className="py-2 px-3 italic">Opening balance</td>
                <td colSpan={3} />
                <td className="py-2 px-3 text-right">{formatMoney(data.openingBalance)}</td>
              </tr>
              {data.entries.map((e) => (
                <tr key={e._id}>
                  <td className="py-2 px-3 whitespace-nowrap">{formatDate(e.date)}</td>
                  <td className="py-2 px-3">{e.description}</td>
                  <td className="py-2 px-3 font-mono">{e.reference}</td>
                  <td className="py-2 px-3 text-right">{e.debit ? formatMoney(e.debit) : ''}</td>
                  <td className="py-2 px-3 text-right text-emerald-600 dark:text-emerald-400">{e.credit ? formatMoney(e.credit) : ''}</td>
                  <td className="py-2 px-3 text-right font-semibold">{formatMoney(e.balance)}</td>
                </tr>
              ))}
              <tr className="font-bold text-slate-900 dark:text-white">
                <td className="py-2.5 px-3" />
                <td className="py-2.5 px-3">Closing balance</td>
                <td />
                <td className="py-2.5 px-3 text-right">{formatMoney(data.totals.debit)}</td>
                <td className="py-2.5 px-3 text-right">{formatMoney(data.totals.credit)}</td>
                <td className="py-2.5 px-3 text-right">{formatMoney(data.closingBalance)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
};

// ---------- Page ----------
const Customers = () => {
  const { can } = useAuth();
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
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  }, [search, filter]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const handleDelete = async (c) => {
    if (!window.confirm(`Remove customer "${c.name}"?`)) return;
    try {
      const res = await deleteCustomer(c._id);
      if (res?.archived) alert(res.message);
      load();
    } catch (err) {
      alert(errMsg(err, 'Failed to remove customer'));
    }
  };

  const overdue = aging ? (aging.totals['31-60'] || 0) + (aging.totals['61-90'] || 0) + (aging.totals['90+'] || 0) : 0;

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 uppercase tracking-wider">
            Accounts Receivable
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">Customers &amp; Credit</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Credit customers, limits, payments and statements
          </p>
        </div>
        <Can perm="customer:manage">
          <button onClick={() => setEditing(null)} className={`${btnPrimary} self-start sm:self-auto`}>
            <Plus className="w-4 h-4" /> New Customer
          </button>
        </Can>
      </div>

      {/* Summary + aging */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        <div className={`${cardCls} p-5`}>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <CreditCard className="w-4 h-4 text-emerald-600" /> Total receivable
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{formatMoney(summary.receivable)}</p>
          <p className="text-[11px] text-slate-500 mt-1">
            {summary.withBalance} customer{summary.withBalance === 1 ? '' : 's'} with a balance, {summary.active} active
          </p>
        </div>
        <div className={`${cardCls} p-5 lg:col-span-2`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <Clock className="w-4 h-4 text-amber-500" /> Aging (days since sale)
            </div>
            {overdue > 0 && (
              <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                {formatMoney(overdue)} older than 30 days
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            {AGING_BUCKETS.map((b, i) => (
              <div
                key={b}
                className={`rounded-xl p-3 border ${
                  i === 0
                    ? 'border-emerald-100 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20'
                    : i === 3
                      ? 'border-rose-100 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20'
                      : 'border-amber-100 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20'
                }`}
              >
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">{b} days</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{formatMoney(aging?.totals?.[b] || 0)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className={`${cardCls} p-4 sm:p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4`}>
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone or email..."
            className={`${inputCls} pl-9`}
          />
        </div>
        <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-medium">
          {[
            ['', 'All'],
            ['balance', 'With balance'],
            ['active', 'Active'],
            ['inactive', 'Inactive'],
          ].map(([v, l]) => (
            <button
              key={v || 'all'}
              onClick={() => setFilter(v)}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
                filter === v
                  ? 'bg-white dark:bg-[#161c26] text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className={`${cardCls} overflow-hidden`}>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8">
              <CardSkeleton height="h-64" />
            </div>
          ) : customers.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {search || filter ? 'No matching customers' : 'No customers yet'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Add customers to sell on credit and track what they owe.
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800 text-[11px]">
                <tr>
                  <th className="py-3.5 px-5">Customer</th>
                  <th className="py-3.5 px-4">Phone</th>
                  <th className="py-3.5 px-4 text-right">Credit limit</th>
                  <th className="py-3.5 px-4 text-right">Balance</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80 dark:divide-slate-800/60 font-medium">
                {customers.map((c) => {
                  const over = c.creditLimit !== null && c.creditLimit > 0 && c.balance > c.creditLimit;
                  return (
                    <tr key={c._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-5">
                        <span className="font-bold text-slate-900 dark:text-white block">{c.name}</span>
                        {c.email && <span className="text-[10px] text-slate-400">{c.email}</span>}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-700 dark:text-slate-300">{c.phone || '-'}</td>
                      <td className="py-3.5 px-4 text-right text-slate-600 dark:text-slate-400">{limitLabel(c.creditLimit)}</td>
                      <td
                        className={`py-3.5 px-4 text-right font-bold ${
                          c.balance > 0
                            ? over
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-500'
                        }`}
                      >
                        {formatMoney(c.balance)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full border ${
                            c.active
                              ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800'
                              : 'text-slate-500 bg-slate-100 border-slate-200 dark:bg-slate-800 dark:border-slate-700'
                          }`}
                        >
                          {c.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {can('customer:manage') && c.balance > 0 && (
                            <button
                              onClick={() => setPaying(c)}
                              title="Record payment"
                              className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-emerald-400 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                            >
                              <Wallet className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => setStatementFor(c)}
                            title="Statement"
                            className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-emerald-400 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                          <Can perm="customer:manage">
                            <button
                              onClick={() => setEditing(c)}
                              title="Edit"
                              className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-emerald-400 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(c)}
                              title="Remove"
                              className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 dark:text-slate-400 dark:hover:text-rose-400 dark:hover:bg-rose-950/30 rounded-lg transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </Can>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Aging by customer */}
      {aging?.customers?.length > 0 && (
        <div className={`${cardCls} overflow-hidden`}>
          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 text-sm font-bold text-slate-900 dark:text-white">
            Receivables aging by customer
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-5">Customer</th>
                  {AGING_BUCKETS.map((b) => (
                    <th key={b} className="py-3 px-4 text-right">
                      {b}
                    </th>
                  ))}
                  <th className="py-3 px-5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {aging.customers.map((r) => (
                  <tr key={r.customerId}>
                    <td className="py-2.5 px-5 font-semibold text-slate-900 dark:text-white">{r.name}</td>
                    {AGING_BUCKETS.map((b) => (
                      <td key={b} className={`py-2.5 px-4 text-right ${b === '90+' && r.buckets[b] > 0 ? 'text-rose-600 dark:text-rose-400' : ''}`}>
                        {r.buckets[b] ? formatMoney(r.buckets[b]) : '-'}
                      </td>
                    ))}
                    <td className="py-2.5 px-5 text-right font-bold">{formatMoney(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing !== undefined && (
        <CustomerFormModal customer={editing} onClose={() => setEditing(undefined)} onSaved={load} />
      )}
      {paying && <PaymentModal customer={paying} onClose={() => setPaying(null)} onSaved={load} />}
      {statementFor && <StatementModal customer={statementFor} onClose={() => setStatementFor(null)} />}
    </div>
  );
};

export default Customers;
