import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { inputCls, labelCls, sectionCls, sectionTitle } from './medicineForm';

const Toggle = ({ name, checked, onChange }) => (
  <label className="relative inline-flex items-center cursor-pointer shrink-0">
    <input type="checkbox" name={name} checked={checked} onChange={onChange} className="sr-only peer" />
    <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
  </label>
);

// Regulatory & tax block of MedicineModal: Rx flag, controlled substance, tax exemption.
const MedicineRegulatorySection = ({ formData, onChange }) => {
  const { t } = useTranslation('medicines');

  return (
    <div className={`${sectionCls} space-y-3`}>
      <p className={sectionTitle}>{t('modal.regulatoryTitle')}</p>
      <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              formData.requiresPrescription
                ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {formData.requiresPrescription ? <ShieldAlert className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
          </div>
          <div>
            <p className="text-xs font-bold text-slate-800 dark:text-white">{t('modal.rxRequired')}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('modal.rxHint')}</p>
          </div>
        </div>
        <Toggle name="requiresPrescription" checked={formData.requiresPrescription} onChange={onChange} />
      </div>

      <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-800 dark:text-white">{t('modal.controlled')}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('modal.controlledHint')}</p>
          </div>
          <Toggle name="isControlled" checked={formData.isControlled} onChange={onChange} />
        </div>
        {formData.isControlled && (
          <div className="mt-3 max-w-xs">
            <label className={labelCls}>{t('modal.schedule')}</label>
            <input
              type="text"
              name="controlledSchedule"
              value={formData.controlledSchedule}
              onChange={onChange}
              placeholder={t('modal.schedulePlaceholder')}
              className={inputCls}
            />
          </div>
        )}
      </div>

      <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-slate-800 dark:text-white">{t('modal.taxExempt')}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('modal.taxExemptHint')}</p>
        </div>
        <Toggle name="taxExempt" checked={formData.taxExempt} onChange={onChange} />
      </div>
    </div>
  );
};

export default MedicineRegulatorySection;
