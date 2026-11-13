import { useState } from 'react';
import { CheckCircle, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createSupplierInvoice } from '../../api/payableApi';
import { PayablesModal, ErrorBox } from './PayablesModal';
import { inputCls, labelCls, btnPrimary, btnGhost, errMsg, today } from './payablesUtils';
import EthiopianDateHint from '../common/EthiopianDateHint';

const InvoiceModal = ({ suppliers, defaultSupplierId, onClose, onSaved }) => {
  const { t } = useTranslation('payables');
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
    if (!form.supplierId) return setError(t('invoiceModal.errors.supplier'));
    if (!form.invoiceNo.trim()) return setError(t('invoiceModal.errors.invoiceNo'));
    if (!(Number(form.amount) > 0)) return setError(t('errors.positiveAmount'));
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, amount: Number(form.amount) };
      if (!payload.dueDate) delete payload.dueDate;
      await createSupplierInvoice(payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(errMsg(err, t('invoiceModal.errors.save')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PayablesModal title={t('invoiceModal.title')} subtitle={t('invoiceModal.subtitle')} icon={FileText} onClose={onClose}>
      <ErrorBox error={error} />
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="payable-invoice-supplier" className={labelCls}>{t('fields.supplier')}</label>
          <select id="payable-invoice-supplier" className={inputCls} value={form.supplierId} onChange={set('supplierId')}>
            <option value="">{t('invoiceModal.selectSupplier')}</option>
            {suppliers.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="payable-invoice-invoice-no" className={labelCls}>{t('fields.invoiceNo')}</label>
            <input id="payable-invoice-invoice-no" className={inputCls} value={form.invoiceNo} onChange={set('invoiceNo')} />
          </div>
          <div>
            <label htmlFor="payable-invoice-amount" className={labelCls}>{t('fields.amount')}</label>
            <input id="payable-invoice-amount" type="number" min="0.01" step="0.01" className={inputCls} value={form.amount} onChange={set('amount')} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="payable-invoice-date" className={labelCls}>{t('fields.invoiceDate')}</label>
            <input id="payable-invoice-date" type="date" className={inputCls} value={form.invoiceDate} onChange={set('invoiceDate')} aria-describedby="payable-invoice-date-eth" />
            <EthiopianDateHint value={form.invoiceDate} id="payable-invoice-date-eth" />
          </div>
          <div>
            <label htmlFor="payable-due-date" className={labelCls}>{t('fields.dueDate')}</label>
            <input id="payable-due-date" type="date" className={inputCls} value={form.dueDate} onChange={set('dueDate')} aria-describedby="payable-due-date-eth" />
            <EthiopianDateHint value={form.dueDate} id="payable-due-date-eth" />
            <p className="text-[10px] text-slate-400 mt-1">
              {supplier
                ? t('invoiceModal.dueHintWithTerms', { count: supplier.paymentTermsDays ?? 30 })
                : t('invoiceModal.dueHint')}
            </p>
          </div>
        </div>
        <div>
          <label htmlFor="payable-invoice-notes" className={labelCls}>{t('fields.notes')}</label>
          <input id="payable-invoice-notes" className={inputCls} value={form.notes} onChange={set('notes')} />
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/80">
          <button type="button" onClick={onClose} className={btnGhost}>
            {t('common:buttons.cancel')}
          </button>
          <button type="submit" disabled={saving} className={btnPrimary}>
            <CheckCircle className="w-4 h-4" /> {saving ? t('saving') : t('invoiceModal.submit')}
          </button>
        </div>
      </form>
    </PayablesModal>
  );
};

export default InvoiceModal;
