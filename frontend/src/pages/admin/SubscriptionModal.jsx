import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, CreditCard, Loader2 } from 'lucide-react';
import { updateSubscription } from '../../api/adminApi';
import EthiopianDateHint from '../../components/common/EthiopianDateHint';

const STATUSES = ['trial', 'active', 'past_due', 'cancelled'];

const inputClass =
  'w-full mt-1 px-3 py-2 bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500';

const toInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

// Set / extend the subscription of one pharmacy (#24).
// The parent mounts it with a `key` per pharmacy so the form starts fresh.
const SubscriptionModal = ({ pharmacy, onClose, onSaved }) => {
  const { t } = useTranslation('admin');
  const sub = pharmacy?.subscription || {};
  const [plan, setPlan] = useState(sub.plan || 'standard');
  const [status, setStatus] = useState(sub.status || 'active');
  const [periodEnd, setPeriodEnd] = useState(toInput(sub.currentPeriodEnd));
  const [extendDays, setExtendDays] = useState('');
  const [reactivate, setReactivate] = useState(pharmacy?.status === 'suspended');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!pharmacy) return null;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const data = { plan, status, reactivate };
      if (extendDays) data.extendDays = Number(extendDays);
      else data.currentPeriodEnd = periodEnd || null;
      await updateSubscription(pharmacy._id, data);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || t('subscription.failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-[#161c26] rounded-2xl border border-slate-100 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <CreditCard className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('subscription.title')}</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{pharmacy.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <label className="block">
            <span className="font-semibold text-slate-700 dark:text-slate-300">{t('subscription.plan')}</span>
            <input value={plan} onChange={(e) => setPlan(e.target.value)} maxLength={50} className={inputClass} list="plan-options" />
            <datalist id="plan-options">
              <option value="basic" />
              <option value="standard" />
              <option value="premium" />
              <option value="enterprise" />
            </datalist>
          </label>
          <label className="block">
            <span className="font-semibold text-slate-700 dark:text-slate-300">{t('subscription.billingStatus')}</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`subscription.statuses.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <div>
            <label className="block">
              <span className="font-semibold text-slate-700 dark:text-slate-300">{t('shared.periodEnds')}</span>
              <input
                type="date"
                value={periodEnd}
                disabled={Boolean(extendDays)}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className={`${inputClass} disabled:opacity-50`}
                aria-describedby="subscription-period-end-eth"
              />
            </label>
            <EthiopianDateHint value={periodEnd} id="subscription-period-end-eth" />
          </div>
          <label className="block">
            <span className="font-semibold text-slate-700 dark:text-slate-300">{t('subscription.extendBy')}</span>
            <select value={extendDays} onChange={(e) => setExtendDays(e.target.value)} className={inputClass}>
              <option value="">{t('subscription.dontExtend')}</option>
              <option value="30">{t('subscription.days', { count: 30 })}</option>
              <option value="90">{t('subscription.days', { count: 90 })}</option>
              <option value="180">{t('subscription.days', { count: 180 })}</option>
              <option value="365">{t('subscription.oneYear')}</option>
            </select>
          </label>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {t('subscription.hint')}
        </p>
        {pharmacy.status === 'suspended' && (
          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={reactivate} onChange={(e) => setReactivate(e.target.checked)} />
            {t('subscription.reactivate')}
          </label>
        )}
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer">
            {t('buttons.cancel', { ns: 'common' })}
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {t('buttons.save', { ns: 'common' })}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionModal;
