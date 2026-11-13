import { useState, useEffect } from 'react';
import { Wallet, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getCustomerById, recordCustomerPayment } from '../../api/customerApi';
import { formatMoney, formatDate } from '../../utils/format';
import { Modal, ErrorBox } from './CustomerModal';
import { inputCls, labelCls, btnPrimary, btnGhost, errMsg, PAYMENT_METHODS } from './customerUi';

// ---------- Record payment ----------
const CustomerPaymentModal = ({ customer, onClose, onSaved }) => {
  const { t } = useTranslation('customers');
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
    if (!(n > 0)) return setError(t('payment.errors.positive'));
    if (n > customer.balance + 0.005) return setError(t('payment.errors.exceeds'));
    setSaving(true);
    setError('');
    try {
      await recordCustomerPayment(customer._id, { amount: n, method, reference, note });
      onSaved();
      onClose();
    } catch (err) {
      setError(errMsg(err, t('payment.errors.failed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t('payment.title')}
      subtitle={t('payment.owes', { name: customer.name, amount: formatMoney(customer.balance) })}
      icon={Wallet}
      onClose={onClose}
    >
      <ErrorBox error={error} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t('payment.amount')}</label>
            <input type="number" min="0.01" step="0.01" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>{t('payment.method')}</label>
            <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`paymentMethods.${m}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t('payment.reference')}</label>
            <input
              className={inputCls}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={t('payment.referencePlaceholder')}
            />
          </div>
          <div>
            <label className={labelCls}>{t('payment.note')}</label>
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        {preview.length > 0 && (
          <div className="rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 dark:bg-slate-800/40">
              {t('payment.appliedTo')}
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
            {t('common:buttons.cancel')}
          </button>
          <button type="submit" disabled={saving} className={btnPrimary}>
            <CheckCircle className="w-4 h-4" />
            {saving ? t('saving') : t('payment.submit')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default CustomerPaymentModal;
