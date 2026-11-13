import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { MEMBERSHIP_ROLES } from '../../config/permissions';
import StaffModal from './StaffModal';
import { inputCls, labelCls } from './staffUi';

// "Add staff member" form.
const AddStaffModal = ({ form, setForm, onSubmit, onClose, saving, error, roleLabel, roleHelp }) => {
  const { t } = useTranslation(['staff', 'common']);

  return (
    <StaffModal title={t('addModal.title')} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className={labelCls}>{t('addModal.fullName')}</label>
          <input
            className={inputCls}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label className={labelCls}>{t('addModal.email')}</label>
          <input
            type="email"
            className={inputCls}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </div>
        <div>
          <label className={labelCls}>{t('addModal.tempPassword')}</label>
          <input
            type="password"
            autoComplete="new-password"
            className={inputCls}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            minLength={8}
            required
          />
          <p className="text-[10px] text-slate-400 mt-1">{t('addModal.tempPasswordHint')}</p>
        </div>
        <div>
          <label className={labelCls}>{t('addModal.role')}</label>
          <select
            className={inputCls}
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            {MEMBERSHIP_ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-slate-400 mt-1">{roleHelp(form.role)}</p>
        </div>
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
            <Plus className="w-4 h-4" /> {saving ? t('addModal.saving') : t('addModal.create')}
          </button>
        </div>
      </form>
    </StaffModal>
  );
};

export default AddStaffModal;
