import { useState } from 'react';
import { X, Plus, Trash2, UserPlus, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createPatient, updatePatient } from '../../api/clinicalApi';
import { inputCls, labelCls, primaryBtn, secondaryBtn, errMsg } from './ui';

const toInputDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

const initialForm = (patient) => ({
  name: patient?.name || '',
  dateOfBirth: toInputDate(patient?.dateOfBirth),
  age: patient?.age ?? '',
  sex: patient?.sex || 'unknown',
  phone: patient?.phone || '',
  conditions: (patient?.conditions || []).join(', '),
  notes: patient?.notes || '',
  allergies: (patient?.allergies || []).map((a) => ({
    substance: a.substance,
    reaction: a.reaction || '',
    severity: a.severity || 'unknown',
  })),
});

/**
 * Create / edit a patient.
 * Props:
 *   isOpen: boolean
 *   patient: patient object to edit, or null to create
 *   onClose(): void
 *   onSaved(patient): called with the saved patient
 * Mount it with a `key` that changes per patient (e.g. key={patient?._id || 'new'}) to reset the form.
 */
const PatientFormModal = ({ isOpen, patient = null, onClose, onSaved }) => {
  const { t } = useTranslation('patients');
  const [form, setForm] = useState(() => initialForm(patient));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const setAllergy = (i, field, value) =>
    setForm((f) => ({ ...f, allergies: f.allergies.map((a, idx) => (idx === i ? { ...a, [field]: value } : a)) }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError(t('form.errors.nameRequired'));
    const payload = {
      name: form.name,
      dateOfBirth: form.dateOfBirth || null,
      age: form.dateOfBirth ? null : form.age === '' ? null : Number(form.age),
      sex: form.sex,
      phone: form.phone,
      conditions: form.conditions,
      notes: form.notes,
      allergies: form.allergies.filter((a) => a.substance.trim()),
    };
    setSaving(true);
    try {
      const res = patient ? await updatePatient(patient._id, payload) : await createPatient(payload);
      onSaved?.(res.patient);
      onClose?.();
    } catch (err) {
      setError(errMsg(err, t('form.errors.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-[#161c26] border border-slate-200/90 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <UserPlus className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">{patient ? t('form.editTitle') : t('form.newTitle')}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common:buttons.close')} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs border border-rose-200 dark:border-rose-900/50">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className={labelCls}>{t('form.fullName')} *</label>
              <input className={inputCls} value={form.name} onChange={set('name')} autoFocus />
            </div>
            <div>
              <label className={labelCls}>{t('fields.dateOfBirth')}</label>
              <input type="date" className={inputCls} value={form.dateOfBirth} onChange={set('dateOfBirth')} max={toInputDate(new Date())} />
            </div>
            <div>
              <label className={labelCls}>{t('form.ageIfUnknown')}</label>
              <input type="number" min="0" max="150" className={inputCls} value={form.age} onChange={set('age')} disabled={Boolean(form.dateOfBirth)} />
            </div>
            <div>
              <label className={labelCls}>{t('fields.sex')}</label>
              <select className={inputCls} value={form.sex} onChange={set('sex')}>
                <option value="unknown">{t('sex.unknown')}</option>
                <option value="female">{t('sex.female')}</option>
                <option value="male">{t('sex.male')}</option>
                <option value="other">{t('sex.other')}</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{t('fields.phone')}</label>
              <input className={inputCls} value={form.phone} onChange={set('phone')} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>{t('form.conditions')}</label>
              <input className={inputCls} value={form.conditions} onChange={set('conditions')} placeholder={t('form.conditionsPlaceholder')} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={`${labelCls} mb-0`}>{t('fields.allergies')}</label>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, allergies: [...f.allergies, { substance: '', reaction: '', severity: 'unknown' }] }))}
                className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> {t('form.addAllergy')}
              </button>
            </div>
            {form.allergies.length === 0 && <p className="text-[11px] text-slate-400 italic">{t('form.noAllergies')}</p>}
            <div className="space-y-2">
              {form.allergies.map((a, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input className={`${inputCls} col-span-4`} placeholder={t('form.substancePlaceholder')} value={a.substance} onChange={(e) => setAllergy(i, 'substance', e.target.value)} />
                  <input className={`${inputCls} col-span-4`} placeholder={t('form.reactionPlaceholder')} value={a.reaction} onChange={(e) => setAllergy(i, 'reaction', e.target.value)} />
                  <select className={`${inputCls} col-span-3`} value={a.severity} onChange={(e) => setAllergy(i, 'severity', e.target.value)}>
                    <option value="unknown">{t('allergySeverity.unknown')}</option>
                    <option value="mild">{t('allergySeverity.mild')}</option>
                    <option value="moderate">{t('allergySeverity.moderate')}</option>
                    <option value="severe">{t('allergySeverity.severe')}</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, allergies: f.allergies.filter((_, idx) => idx !== i) }))}
                    className="col-span-1 p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                    title={t('form.removeAllergy')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>{t('fields.notes')}</label>
            <textarea rows={2} className={inputCls} value={form.notes} onChange={set('notes')} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className={secondaryBtn}>{t('common:buttons.cancel')}</button>
            <button type="submit" disabled={saving} className={primaryBtn}>{saving ? t('saving') : t('form.save')}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PatientFormModal;
