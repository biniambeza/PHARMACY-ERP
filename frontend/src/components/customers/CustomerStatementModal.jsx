import { useState, useEffect } from 'react';
import { FileText, Printer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getCustomerStatement } from '../../api/customerApi';
import { useAuth } from '../../context/useAuth';
import { CardSkeleton } from '../common/SkeletonLoader';
import { formatMoney, formatDate } from '../../utils/format';
import { Modal, ErrorBox } from './CustomerModal';
import { inputCls, labelCls, btnPrimary, errMsg, escapeHtml } from './customerUi';

// ---------- Statement ----------
const CustomerStatementModal = ({ customer, onClose }) => {
  const { t } = useTranslation('customers');
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
      .catch((err) => !cancelled && setError(errMsg(err, t('statement.loadFailed'))));
    return () => {
      cancelled = true;
    };
  }, [customer._id, from, to, t]);

  const print = () => {
    if (!data) return;
    const h = (k, o) => escapeHtml(t(k, o));
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
    w.document.write(`<!doctype html><html><head><title>${h('statement.printTitle', { name: customer.name })}</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:24px}h1{font-size:18px;margin:0}
table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left}
.r{text-align:right}.muted{color:#666}.tot td{font-weight:bold;border-top:2px solid #111}</style></head><body>
<h1>${escapeHtml(activePharmacy?.name || t('statement.pharmacy'))}</h1>
<p class="muted">${escapeHtml(activePharmacy?.address || '')} ${escapeHtml(activePharmacy?.phone || '')}</p>
<h2 style="font-size:15px">${h('statement.title')}</h2>
<p><strong>${escapeHtml(customer.name)}</strong> ${escapeHtml(customer.phone || '')}<br/>
<span class="muted">${h('statement.period', {
      from: from ? formatDate(from) : t('statement.start'),
      to: to ? formatDate(to) : formatDate(new Date()),
    })}</span></p>
<table><thead><tr><th>${h('statement.cols.date')}</th><th>${h('statement.cols.description')}</th><th>${h(
      'statement.cols.reference'
    )}</th><th class="r">${h('statement.cols.charges')}</th><th class="r">${h('statement.cols.payments')}</th><th class="r">${h(
      'statement.cols.balance'
    )}</th></tr></thead>
<tbody><tr><td></td><td>${h('statement.opening')}</td><td></td><td></td><td></td><td class="r">${escapeHtml(formatMoney(data.openingBalance))}</td></tr>
${rows}<tr class="tot"><td></td><td>${h('statement.closing')}</td><td></td><td class="r">${escapeHtml(formatMoney(data.totals.debit))}</td>
<td class="r">${escapeHtml(formatMoney(data.totals.credit))}</td><td class="r">${escapeHtml(formatMoney(data.closingBalance))}</td></tr></tbody></table>
<p class="muted" style="margin-top:24px">${h('statement.printed', { date: new Date().toLocaleString() })}</p></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <Modal title={t('statement.title')} subtitle={customer.name} icon={FileText} onClose={onClose} wide>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className={labelCls}>{t('statement.from')}</label>
          <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>{t('statement.to')}</label>
          <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button onClick={print} disabled={!data} className={`${btnPrimary} ml-auto`}>
          <Printer className="w-4 h-4" /> {t('common:buttons.print')}
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
                <th className="py-2.5 px-3">{t('statement.cols.date')}</th>
                <th className="py-2.5 px-3">{t('statement.cols.description')}</th>
                <th className="py-2.5 px-3">{t('statement.cols.reference')}</th>
                <th className="py-2.5 px-3 text-right">{t('statement.cols.charges')}</th>
                <th className="py-2.5 px-3 text-right">{t('statement.cols.payments')}</th>
                <th className="py-2.5 px-3 text-right">{t('statement.cols.balance')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              <tr className="text-slate-500">
                <td className="py-2 px-3" />
                <td className="py-2 px-3 italic">{t('statement.opening')}</td>
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
                <td className="py-2.5 px-3">{t('statement.closing')}</td>
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

export default CustomerStatementModal;
