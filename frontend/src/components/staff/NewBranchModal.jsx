import { useTranslation } from 'react-i18next';
import { Building2 } from 'lucide-react';
import StaffModal from './StaffModal';
import { inputCls, labelCls } from './staffUi';

// "New branch" form (owners only).
const NewBranchModal = ({ branchForm, setBranchForm, onSubmit, onClose, saving, error }) => {
  const { t } = useTranslation(['staff', 'common']);

  return (
    <StaffModal title={t('branchModal.title')} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        {['name', 'address', 'phone', 'licenseNo'].map((key) => (
          <div key={key}>
            <label className={labelCls}>{t(`branchModal.${key}`)}</label>
            <input
              className={inputCls}
              value={branchForm[key]}
              onChange={(e) => setBranchForm({ ...branchForm, [key]: e.target.value })}
              required
            />
          </div>
        ))}
        <p className="text-[10px] text-slate-400">{t('branchModal.hint')}</p>
        {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            {t('common:buttons.cancel')}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-60"
          >
            <Building2 className="w-4 h-4" /> {saving ? t('branchModal.creating') : t('branchModal.create')}
          </button>
        </div>
      </form>
    </StaffModal>
  );
};

export default NewBranchModal;
