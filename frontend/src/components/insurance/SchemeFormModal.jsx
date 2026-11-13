import { useEffect, useState } from 'react';
import { ShieldCheck, CheckCircle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createScheme, updateScheme } from '../../api/insuranceApi';
import { getMedicines } from '../../api/medicineApi';
import { Modal, ErrorBox } from '../customers/CustomerModal';
import { inputCls, labelCls, btnPrimary, btnGhost, errMsg, SCHEME_TYPES, COPAY_TYPES, CLAIM_CYCLES } from './insuranceUi';

// Create / edit an insurance scheme (coverage, copay, exclusions, payer contact).
const SchemeFormModal = ({ scheme, onClose, onSaved }) => {
  const { t } = useTranslation('insurance');
  const [form, setForm] = useState(() => ({
    name: scheme?.name || '',
    code: scheme?.code || '',
    type: scheme?.type || 'cbhi',
    coveragePercent: String(scheme?.coveragePercent ?? 100),
    copayType: scheme?.copayType || 'none',
    copayValue: String(scheme?.copayValue ?? 0),
    maxPerSale: String(scheme?.maxPerSale ?? 0),
    claimCycle: scheme?.claimCycle || 'monthly',
    excludedCategories: (scheme?.excludedCategories || []).join(', '),
    notes: scheme?.notes || '',
    active: scheme ? scheme.active : true,
    autoClaim: scheme ? scheme.autoClaim !== false : true,
    payer: {
      name: scheme?.payer?.name || '',
      contactPerson: scheme?.payer?.contactPerson || '',
      phone: scheme?.payer?.phone || '',
      email: scheme?.payer?.email || '',
      address: scheme?.payer?.address || '',
    },
  }));
  const [excluded, setExcluded] = useState(() =>
    (scheme?.excludedMedicineIds || []).filter((m) => m && m._id).map((m) => ({ _id: m._id, name: m.name }))
  );
  const [medSearch, setMedSearch] = useState('');
  const [medResults, setMedResults] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const setPayer = (k) => (e) => setForm((f) => ({ ...f, payer: { ...f.payer, [k]: e.target.value } }));

  useEffect(() => {
    const q = medSearch.trim();
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (q.length < 2) {
        if (!cancelled) setMedResults([]);
        return;
      }
      try {
        const res = await getMedicines({ search: q, page: 1, limit: 8 });
        if (!cancelled) setMedResults(res.medicines || []);
      } catch {
        if (!cancelled) setMedResults([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [medSearch]);

  const addExcluded = (m) => {
    setExcluded((list) => (list.some((x) => x._id === m._id) ? list : [...list, { _id: m._id, name: m.name }]));
    setMedSearch('');
    setMedResults([]);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError(t('schemes.errors.nameRequired'));
    const coverage = Number(form.coveragePercent);
    if (!Number.isFinite(coverage) || coverage < 0 || coverage > 100) return setError(t('schemes.errors.coverage'));
    const copay = Number(form.copayValue || 0);
    if (!Number.isFinite(copay) || copay < 0 || (form.copayType === 'percent' && copay > 100)) {
      return setError(t('schemes.errors.copay'));
    }
    setSaving(true);
    setError('');
    const payload = {
      ...form,
      coveragePercent: coverage,
      copayValue: form.copayType === 'none' ? 0 : copay,
      maxPerSale: Number(form.maxPerSale || 0),
      excludedCategories: form.excludedCategories.split(',').map((c) => c.trim()).filter(Boolean),
      excludedMedicineIds: excluded.map((m) => m._id),
    };
    try {
      if (scheme) await updateScheme(scheme._id, payload);
      else await createScheme(payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(errMsg(err, t('schemes.errors.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={scheme ? t('schemes.editTitle') : t('schemes.newTitle')} subtitle={t('schemes.formSubtitle')} icon={ShieldCheck} onClose={onClose} wide>
      <ErrorBox error={error} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className={labelCls}>{t('fields.name')} <span className="text-rose-500">*</span></label>
            <input className={inputCls} value={form.name} onChange={set('name')} required />
          </div>
          <div>
            <label className={labelCls}>{t('fields.code')}</label>
            <input className={inputCls} value={form.code} onChange={set('code')} />
          </div>
          <div>
            <label className={labelCls}>{t('fields.type')}</label>
            <select className={`${inputCls} cursor-pointer`} value={form.type} onChange={set('type')}>
              {SCHEME_TYPES.map((v) => <option key={v} value={v}>{t(`types.${v}`)}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('fields.coveragePercent')}</label>
            <input type="number" min="0" max="100" step="0.01" className={`${inputCls} font-mono`} value={form.coveragePercent} onChange={set('coveragePercent')} />
          </div>
          <div>
            <label className={labelCls}>{t('fields.claimCycle')}</label>
            <select className={`${inputCls} cursor-pointer`} value={form.claimCycle} onChange={set('claimCycle')}>
              {CLAIM_CYCLES.map((v) => <option key={v} value={v}>{t(`cycles.${v}`)}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('fields.copayType')}</label>
            <select className={`${inputCls} cursor-pointer`} value={form.copayType} onChange={set('copayType')}>
              {COPAY_TYPES.map((v) => <option key={v} value={v}>{t(`copay.${v}`)}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{form.copayType === 'percent' ? t('fields.copayPercent') : t('fields.copayAmount')}</label>
            <input type="number" min="0" step="0.01" disabled={form.copayType === 'none'} className={`${inputCls} font-mono disabled:opacity-50`} value={form.copayValue} onChange={set('copayValue')} />
          </div>
          <div>
            <label className={labelCls}>{t('fields.maxPerSale')}</label>
            <input type="number" min="0" step="0.01" className={`${inputCls} font-mono`} value={form.maxPerSale} onChange={set('maxPerSale')} />
            <p className="text-[10px] text-slate-400 mt-0.5">{t('schemes.maxPerSaleHint')}</p>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl p-2.5">{t('schemes.rulesHint')}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t('fields.excludedCategories')}</label>
            <input className={inputCls} value={form.excludedCategories} onChange={set('excludedCategories')} placeholder={t('schemes.categoriesPlaceholder')} />
          </div>
          <div className="relative">
            <label className={labelCls}>{t('fields.excludedMedicines')}</label>
            <input className={inputCls} value={medSearch} onChange={(e) => setMedSearch(e.target.value)} placeholder={t('schemes.searchMedicine')} />
            {medResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {medResults.map((m) => (
                  <button type="button" key={m._id} onClick={() => addExcluded(m)} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer">
                    {m.name} <span className="text-slate-400">· {m.category}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {excluded.map((m) => (
                <span key={m._id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-[10px] font-semibold">
                  {m.name}
                  <button type="button" aria-label={t('remove')} onClick={() => setExcluded((l) => l.filter((x) => x._id !== m._id))} className="cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        <fieldset className="border border-slate-200 dark:border-slate-800 rounded-xl p-3">
          <legend className="px-1 text-xs font-semibold text-slate-600 dark:text-slate-300">{t('schemes.payer')}</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className={inputCls} value={form.payer.name} onChange={setPayer('name')} placeholder={t('fields.payerName')} />
            <input className={inputCls} value={form.payer.contactPerson} onChange={setPayer('contactPerson')} placeholder={t('fields.contactPerson')} />
            <input className={inputCls} value={form.payer.phone} onChange={setPayer('phone')} placeholder={t('fields.phone')} />
            <input className={inputCls} value={form.payer.email} onChange={setPayer('email')} placeholder={t('fields.email')} />
            <input className={`${inputCls} sm:col-span-2`} value={form.payer.address} onChange={setPayer('address')} placeholder={t('fields.address')} />
          </div>
        </fieldset>

        <div>
          <label className={labelCls}>{t('fields.notes')}</label>
          <textarea rows={2} className={inputCls} value={form.notes} onChange={set('notes')} />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
          <input type="checkbox" checked={form.active} onChange={set('active')} /> {t('fields.active')}
        </label>
        <div>
          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" checked={form.autoClaim} onChange={set('autoClaim')} aria-describedby="scheme-auto-claim-hint" />
            {t('fields.autoClaim')}
          </label>
          <p id="scheme-auto-claim-hint" className="mt-1 ml-6 text-[11px] text-slate-500 dark:text-slate-400">{t('schemes.autoClaimHint')}</p>
        </div>

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

export default SchemeFormModal;
