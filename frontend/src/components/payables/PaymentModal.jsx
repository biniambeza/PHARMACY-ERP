import { useState } from 'react';
import { CheckCircle, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { recordSupplierPayment } from '../../api/payableApi';
import { formatMoney } from '../../utils/format';
import { PayablesModal, ErrorBox } from './PayablesModal';
import { inputCls, labelCls, btnPrimary, btnGhost, METHODS, errMsg, balanceOf, today } from './payablesUtils';

// `target` = { supplierId, supplierName, outstanding, invoice? }
const PaymentModal = ({ target, onClose, onSaved }) => {
  const { t } = useTranslation('payables');
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
    if (!(n > 0)) return setError(t('errors.positiveAmount'));
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
      setError(errMsg(err, t('paymentModal.errors.save')));
    } finally {
      setSaving(false);
    }
  };

  const outstanding = formatMoney(target.outstanding);
  const subtitle = target.invoice
    ? t('paymentModal.subtitleInvoice', { supplier: target.supplierName, invoiceNo: target.invoice.invoiceNo, outstanding })
    : t('paymentModal.subtitle', { supplier: target.supplierName, outstanding });

  return (
    <PayablesModal title={t('paymentModal.title')} subtitle={subtitle} icon={Wallet} onClose={onClose}>
      <ErrorBox error={error} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t('fields.amount')}</label>
            <input type="number" min="0.01" step="0.01" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>{t('fields.method')}</label>
            <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`methods.${m}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t('fields.reference')}</label>
            <input
              className={inputCls}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={t('paymentModal.referencePlaceholder')}
            />
          </div>
          <div>
            <label className={labelCls}>{t('fields.paymentDate')}</label>
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelCls}>{t('fields.note')}</label>
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {target.invoice ? t('paymentModal.allocationInvoice') : t('paymentModal.allocationOldest')}
        </p>
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/80">
          <button type="button" onClick={onClose} className={btnGhost}>
            {t('common:buttons.cancel')}
          </button>
          <button type="submit" disabled={saving} className={btnPrimary}>
            <CheckCircle className="w-4 h-4" /> {saving ? t('saving') : t('paymentModal.submit')}
          </button>
        </div>
      </form>
    </PayablesModal>
  );
};

export default PaymentModal;
