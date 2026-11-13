import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getSchemes, deleteScheme } from '../../api/insuranceApi';
import { formatMoney } from '../../utils/format';
import SchemeFormModal from './SchemeFormModal';
import { cardCls, btnPrimary, errMsg, pillCls, thCls, tdCls } from './insuranceUi';
import { logApiError } from '../../api/logApiError';
import { ErrorBox } from '../reports/ReportUi';

const copayLabel = (s, t) => {
  if (s.copayType === 'percent') return t('copay.percentShort', { value: s.copayValue });
  if (s.copayType === 'fixed') return t('copay.fixedShort', { amount: formatMoney(s.copayValue) });
  return t('copay.none');
};

const SchemesTab = () => {
  const { t } = useTranslation('insurance');
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new

  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getSchemes();
      setSchemes(res.schemes || []);
      setLoadError(false);
    } catch (err) {
      logApiError('Failed to load schemes', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const remove = async (s) => {
    if (!window.confirm(t('schemes.confirmDelete', { name: s.name }))) return;
    try {
      await deleteScheme(s._id);
      load();
    } catch (err) {
      alert(errMsg(err, t('errors.generic')));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('schemes.subtitle')}</p>
        <button onClick={() => setEditing(null)} className={btnPrimary}>
          <Plus className="w-4 h-4" /> {t('schemes.new')}
        </button>
      </div>
      <div className={`${cardCls} overflow-x-auto`}>
        <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800">
          <thead>
            <tr>
              <th className={thCls}>{t('fields.name')}</th>
              <th className={thCls}>{t('fields.type')}</th>
              <th className={thCls}>{t('fields.coveragePercent')}</th>
              <th className={thCls}>{t('fields.copayType')}</th>
              <th className={thCls}>{t('fields.exclusions')}</th>
              <th className={thCls}>{t('fields.members')}</th>
              <th className={thCls}>{t('fields.status')}</th>
              <th className={thCls} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr><td colSpan={8} className={`${tdCls} text-center py-8`}>{t('loading')}</td></tr>
            ) : loadError ? (
              <tr><td colSpan={8} className="p-4"><ErrorBox message={t('common:loadError')} onRetry={load} /></td></tr>
            ) : schemes.length === 0 ? (
              <tr><td colSpan={8} className={`${tdCls} text-center py-8 text-slate-400`}>{t('schemes.empty')}</td></tr>
            ) : (
              schemes.map((s) => (
                <tr key={s._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                  <td className={tdCls}>
                    <div className="font-semibold text-slate-900 dark:text-white">{s.name}</div>
                    {s.payer?.name && <div className="text-[10px] text-slate-400">{s.payer.name}</div>}
                  </td>
                  <td className={tdCls}>{t(`types.${s.type}`)}</td>
                  <td className={`${tdCls} font-mono`}>{s.coveragePercent}%</td>
                  <td className={tdCls}>{copayLabel(s, t)}</td>
                  <td className={tdCls}>
                    {(s.excludedMedicineIds?.length || 0) + (s.excludedCategories?.length || 0) > 0
                      ? t('schemes.exclusionCount', { medicines: s.excludedMedicineIds?.length || 0, categories: s.excludedCategories?.length || 0 })
                      : '-'}
                  </td>
                  <td className={`${tdCls} font-mono`}>{s.memberCount}</td>
                  <td className={tdCls}>
                    <span className={`${pillCls} ${s.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60' : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'}`}>
                      {s.active ? t('status.active') : t('status.inactive')}
                    </span>
                  </td>
                  <td className={`${tdCls} text-right whitespace-nowrap`}>
                    <button onClick={() => setEditing(s)} aria-label={t('edit')} className="p-1.5 text-slate-400 hover:text-emerald-600 cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => remove(s)} aria-label={t('remove')} className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {editing !== undefined && <SchemeFormModal scheme={editing} onClose={() => setEditing(undefined)} onSaved={load} />}
    </div>
  );
};

export default SchemesTab;
