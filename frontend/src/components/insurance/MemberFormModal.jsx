import { useId, useState } from 'react';
import { UserCheck, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createMember, updateMember } from '../../api/insuranceApi';
import { useAuth } from '../../context/useAuth';
import { Modal, ErrorBox } from '../customers/CustomerModal';
import EthiopianDateHint from '../common/EthiopianDateHint';
import PersonLinkPicker from './PersonLinkPicker';
import { inputCls, labelCls, btnPrimary, btnGhost, errMsg, toDateInput } from './insuranceUi';

// A populated link ({ _id, name, phone }) or a bare id -> picker value.
const linkValue = (v) => {
  if (!v) return null;
  if (typeof v === 'object' && v._id) return { _id: String(v._id), name: v.name || '', phone: v.phone || '' };
  return { _id: String(v), name: '', phone: '' };
};

// Create / edit a scheme member (beneficiary). Staff can link an existing patient and/or customer
// (pre-fills name and phone) or type the details manually.
const MemberFormModal = ({ member, schemes, defaultSchemeId, onClose, onSaved }) => {
  const { t } = useTranslation('insurance');
  const { can } = useAuth();
  const uid = useId();
  const fid = (k) => `${uid}-${k}`;
  const canPatients = can('patient:view');
  const canCustomers = can('customer:view');
  const [patient, setPatient] = useState(() => linkValue(member?.patientId));
  const [customer, setCustomer] = useState(() => linkValue(member?.customerId));
  const [form, setForm] = useState(() => ({
    schemeId: String(member?.schemeId?._id || member?.schemeId || defaultSchemeId || schemes[0]?._id || ''),
    memberNo: member?.memberNo || '',
    name: member?.name || '',
    phone: member?.phone || '',
    group: member?.group || '',
    validFrom: toDateInput(member?.validFrom),
    validTo: toDateInput(member?.validTo),
    notes: member?.notes || '',
    active: member ? member.active : true,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  // Picking a record pre-fills the name and phone (still editable).
  const prefill = (rec) => {
    if (!rec) return;
    setForm((f) => ({ ...f, name: rec.name || f.name, phone: rec.phone || f.phone }));
  };
  const pickPatient = (rec) => {
    setPatient(rec ? linkValue(rec) : null);
    prefill(rec);
    // A patient already linked to a customer account: link that customer too
    if (rec?.customerId && !customer && canCustomers) {
      setCustomer(linkValue(rec.customerId));
    }
  };
  const pickCustomer = (rec) => {
    setCustomer(rec ? linkValue(rec) : null);
    if (!patient) prefill(rec);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.schemeId) return setError(t('members.errors.schemeRequired'));
    if (!form.memberNo.trim() || !form.name.trim()) return setError(t('members.errors.required'));
    if (form.validFrom && form.validTo && form.validFrom > form.validTo) return setError(t('members.errors.dates'));
    setSaving(true);
    setError('');
    const payload = { ...form, validFrom: form.validFrom || null, validTo: form.validTo || null };
    // Only send the links the user can see, so a hidden link is never cleared by accident.
    if (canPatients) payload.patientId = patient?._id || null;
    if (canCustomers) payload.customerId = customer?._id || null;
    try {
      if (member) await updateMember(member._id, payload);
      else await createMember(payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(errMsg(err, t('members.errors.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={member ? t('members.editTitle') : t('members.newTitle')} icon={UserCheck} onClose={onClose}>
      <ErrorBox error={error} />
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor={fid('scheme')} className={labelCls}>{t('fields.scheme')} <span className="text-rose-500">*</span></label>
          <select id={fid('scheme')} className={`${inputCls} cursor-pointer`} value={form.schemeId} onChange={set('schemeId')} disabled={Boolean(member)}>
            {schemes.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
        </div>
        {(canPatients || canCustomers) && (
          <fieldset className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
            <legend className="px-1 text-xs font-bold text-slate-700 dark:text-slate-300">{t('members.link.title')}</legend>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('members.link.hint')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {canPatients && <PersonLinkPicker kind="patient" value={patient} onChange={pickPatient} />}
              {canCustomers && <PersonLinkPicker kind="customer" value={customer} onChange={pickCustomer} />}
            </div>
          </fieldset>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor={fid('memberNo')} className={labelCls}>{t('fields.memberNo')} <span className="text-rose-500">*</span></label>
            <input id={fid('memberNo')} className={`${inputCls} font-mono`} value={form.memberNo} onChange={set('memberNo')} required />
          </div>
          <div>
            <label htmlFor={fid('name')} className={labelCls}>{t('fields.name')} <span className="text-rose-500">*</span></label>
            <input id={fid('name')} className={inputCls} value={form.name} onChange={set('name')} required />
          </div>
          <div>
            <label htmlFor={fid('phone')} className={labelCls}>{t('fields.phone')}</label>
            <input id={fid('phone')} type="tel" className={inputCls} value={form.phone} onChange={set('phone')} />
          </div>
          <div>
            <label htmlFor={fid('group')} className={labelCls}>{t('fields.group')}</label>
            <input id={fid('group')} className={inputCls} value={form.group} onChange={set('group')} placeholder={t('members.groupPlaceholder')} />
          </div>
          <div>
            <label htmlFor={fid('validFrom')} className={labelCls}>{t('fields.validFrom')}</label>
            <input id={fid('validFrom')} type="date" className={inputCls} value={form.validFrom} onChange={set('validFrom')} aria-describedby={fid('validFrom-eth')} />
            <EthiopianDateHint value={form.validFrom} id={fid('validFrom-eth')} />
          </div>
          <div>
            <label htmlFor={fid('validTo')} className={labelCls}>{t('fields.validTo')}</label>
            <input id={fid('validTo')} type="date" className={inputCls} value={form.validTo} onChange={set('validTo')} aria-describedby={fid('validTo-eth')} />
            <EthiopianDateHint value={form.validTo} id={fid('validTo-eth')} />
          </div>
        </div>
        <div>
          <label htmlFor={fid('notes')} className={labelCls}>{t('fields.notes')}</label>
          <textarea id={fid('notes')} rows={2} className={inputCls} value={form.notes} onChange={set('notes')} />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
          <input type="checkbox" checked={form.active} onChange={set('active')} /> {t('fields.active')}
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={btnGhost}>{t('common:buttons.cancel')}</button>
          <button type="submit" disabled={saving} className={btnPrimary}>
            <CheckCircle className="w-4 h-4" /> {saving ? t('saving') : t('save')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default MemberFormModal;
