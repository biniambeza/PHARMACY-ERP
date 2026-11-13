import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, FlaskConical, Info, Save } from 'lucide-react';
import { updateEInvoiceSettings } from '../../api/einvoiceApi';
import { primaryBtn } from '../pos/PosModal';
import { cardCls, inputCls, labelCls, errMsg } from '../pos/posUtils';

const PROVIDERS = ['none', 'mock', 'mor'];
const MODES = ['sandbox', 'production'];

const toForm = (s = {}) => ({
  tin: s.tin || '',
  vatRegNo: s.vatRegNo || '',
  vatRegistered: Boolean(s.vatRegistered),
  enabled: Boolean(s.enabled),
  provider: s.provider || 'none',
  mode: s.mode || 'sandbox',
});

/** Fiscal identity + provider settings. Read-only unless `canManage`. */
const EInvoiceSettingsPanel = ({ settings, canManage, onSaved }) => {
  const { t } = useTranslation('einvoice');
  const [form, setForm] = useState(() => toForm(settings));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setForm(toForm(settings)), 0);
    return () => clearTimeout(timer);
  }, [settings]);

  const morInfo = (settings?.providers || []).find((p) => p.name === 'mor');
  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setSaved(false);
    setForm((f) => ({ ...f, [key]: value }));
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await updateEInvoiceSettings(form);
      setSaved(true);
      onSaved?.(res.settings);
    } catch (err) {
      setError(errMsg(err, t('settings.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  const disabled = !canManage || saving;

  return (
    <form onSubmit={save} className={`${cardCls} p-5 space-y-4`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">{t('settings.title')}</h2>
        {!canManage && <span className="text-[11px] text-slate-500">{t('settings.readOnly')}</span>}
      </div>

      <div className="flex gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-200">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <p>{t('settings.morNotice')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <label className="space-y-1">
          <span className={labelCls}>{t('settings.tin')}</span>
          <input value={form.tin} onChange={set('tin')} disabled={disabled} maxLength={20} placeholder="0000000000" className={inputCls} />
        </label>
        <label className="space-y-1">
          <span className={labelCls}>{t('settings.vatRegNo')}</span>
          <input value={form.vatRegNo} onChange={set('vatRegNo')} disabled={disabled} maxLength={50} className={inputCls} />
        </label>
        <label className="flex items-center gap-2 pt-5 text-xs text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={form.vatRegistered} onChange={set('vatRegistered')} disabled={disabled} />
          {t('settings.vatRegistered')}
        </label>
        <label className="space-y-1">
          <span className={labelCls}>{t('settings.provider')}</span>
          <select value={form.provider} onChange={set('provider')} disabled={disabled} className={inputCls}>
            {PROVIDERS.map((p) => <option key={p} value={p}>{t(`providers.${p}`)}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className={labelCls}>{t('settings.mode')}</span>
          <select value={form.mode} onChange={set('mode')} disabled={disabled} className={inputCls}>
            {MODES.map((m) => <option key={m} value={m}>{t(`modes.${m}`)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 pt-5 text-xs text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={form.enabled} onChange={set('enabled')} disabled={disabled} />
          {t('settings.enabled')}
        </label>
      </div>

      {form.provider === 'mock' && (
        <div className="flex gap-2 text-xs text-blue-700 dark:text-blue-300">
          <FlaskConical className="w-4 h-4 shrink-0" />
          <p>{t('settings.mockNotice')}</p>
        </div>
      )}
      {form.provider === 'mor' && (
        <div className="flex gap-2 text-xs text-slate-600 dark:text-slate-300">
          <Info className="w-4 h-4 shrink-0" />
          <p>{morInfo?.configured ? t('settings.morConfigured') : t('settings.morNotConfigured')}</p>
        </div>
      )}

      {error && <p className="text-xs text-rose-600">{error}</p>}
      {saved && !error && <p className="text-xs text-emerald-600">{t('settings.saved')}</p>}

      {canManage && (
        <div className="flex justify-end">
          <button type="submit" className={primaryBtn} disabled={saving}>
            <Save className="w-3.5 h-3.5" /> {saving ? t('settings.saving') : t('common:buttons.save')}
          </button>
        </div>
      )}
    </form>
  );
};

export default EInvoiceSettingsPanel;
