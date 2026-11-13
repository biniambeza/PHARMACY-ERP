import { useState } from 'react';
import { Users, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createCustomer, updateCustomer } from '../../api/customerApi';
import { Modal, ErrorBox } from './CustomerModal';
import { inputCls, labelCls, btnPrimary, btnGhost, errMsg } from './customerUi';

// ---------- Create / edit ----------
const CustomerFormModal = ({ customer, onClose, onSaved }) => {
  const { t } = useTranslation('customers');
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
    if (!form.name.trim()) return setError(t('form.errors.nameRequired'));
    const limit = form.unlimited ? null : Number(form.creditLimit || 0);
    if (limit !== null && (!Number.isFinite(limit) || limit < 0)) return setError(t('form.errors.limitInvalid'));
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
      setError(errMsg(err, t('form.errors.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={customer ? t('form.editTitle') : t('form.newTitle')}
      subtitle={t('form.subtitle')}
      icon={Users}
      onClose={onClose}
    >
      <ErrorBox error={error} />
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls}>
            {t('form.fullName')} <span className="text-rose-500">*</span>
          </label>
          <input className={inputCls} value={form.name} onChange={set('name')} required />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t('fields.phone')}</label>
            <input className={inputCls} value={form.phone} onChange={set('phone')} placeholder={t('form.phonePlaceholder')} />
          </div>
          <div>
            <label className={labelCls}>{t('fields.email')}</label>
            <input type="email" className={inputCls} value={form.email} onChange={set('email')} />
          </div>
        </div>
        <div>
          <label className={labelCls}>{t('fields.address')}</label>
          <input className={inputCls} value={form.address} onChange={set('address')} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
          <div>
            <label className={labelCls}>{t('fields.creditLimit')}</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputCls}
              value={form.creditLimit}
              onChange={set('creditLimit')}
              disabled={form.unlimited}
            />
            <p className="text-[10px] text-slate-400 mt-1">{t('form.zeroHint')}</p>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 pb-5 cursor-pointer">
            <input type="checkbox" checked={form.unlimited} onChange={set('unlimited')} className="accent-emerald-600" />
            {t('form.unlimited')}
          </label>
        </div>
        <div>
          <label className={labelCls}>{t('fields.notes')}</label>
          <textarea rows="2" className={inputCls} value={form.notes} onChange={set('notes')} />
        </div>
        {customer && (
          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={set('active')} className="accent-emerald-600" />
            {t('form.accountActive')}
          </label>
        )}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/80">
          <button type="button" onClick={onClose} className={btnGhost}>
            {t('common:buttons.cancel')}
          </button>
          <button type="submit" disabled={saving} className={btnPrimary}>
            <CheckCircle className="w-4 h-4" />
            {saving ? t('saving') : customer ? t('form.saveChanges') : t('form.create')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default CustomerFormModal;
