import { useState } from 'react';
import { UserCheck, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createMember, updateMember } from '../../api/insuranceApi';
import { Modal, ErrorBox } from '../customers/CustomerModal';
import { inputCls, labelCls, btnPrimary, btnGhost, errMsg, toDateInput } from './insuranceUi';

// Create / edit a scheme member (beneficiary).
const MemberFormModal = ({ member, schemes, defaultSchemeId, onClose, onSaved }) => {
  const { t } = useTranslation('insurance');
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

  const submit = async (e) => {
    e.preventDefault();
    if (!form.schemeId) return setError(t('members.errors.schemeRequired'));
    if (!form.memberNo.trim() || !form.name.trim()) return setError(t('members.errors.required'));
    if (form.validFrom && form.validTo && form.validFrom > form.validTo) return setError(t('members.errors.dates'));
    setSaving(true);
    setError('');
    const payload = { ...form, validFrom: form.validFrom || null, validTo: form.validTo || null };
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
          <label className={labelCls}>{t('fields.scheme')} <span className="text-rose-500">*</span></label>
          <select className={`${inputCls} cursor-pointer`} value={form.schemeId} onChange={set('schemeId')} disabled={Boolean(member)}>
            {schemes.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t('fields.memberNo')} <span className="text-rose-500">*</span></label>
            <input className={`${inputCls} font-mono`} value={form.memberNo} onChange={set('memberNo')} required />
          </div>
          <div>
            <label className={labelCls}>{t('fields.name')} <span className="text-rose-500">*</span></label>
            <input className={inputCls} value={form.name} onChange={set('name')} required />
          </div>
          <div>
            <label className={labelCls}>{t('fields.phone')}</label>
            <input className={inputCls} value={form.phone} onChange={set('phone')} />
          </div>
          <div>
            <label className={labelCls}>{t('fields.group')}</label>
            <input className={inputCls} value={form.group} onChange={set('group')} placeholder={t('members.groupPlaceholder')} />
          </div>
          <div>
            <label className={labelCls}>{t('fields.validFrom')}</label>
            <input type="date" className={inputCls} value={form.validFrom} onChange={set('validFrom')} />
          </div>
          <div>
            <label className={labelCls}>{t('fields.validTo')}</label>
            <input type="date" className={inputCls} value={form.validTo} onChange={set('validTo')} />
          </div>
        </div>
        <div>
          <label className={labelCls}>{t('fields.notes')}</label>
          <textarea rows={2} className={inputCls} value={form.notes} onChange={set('notes')} />
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
