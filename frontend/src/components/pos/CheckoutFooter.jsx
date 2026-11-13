import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../../utils/format';
import { SEVERE } from './posCheckout';

/**
 * Confirmation checkbox for severe clinical warnings (allergy / major interaction).
 * Props: { warnings: { interactions, allergyHits }, checked, onChange(bool) }
 */
export const ClinicalAck = ({ warnings, checked, onChange }) => {
  const { t } = useTranslation('pos');
  const allergy = warnings.allergyHits.length > 0;
  const what = [
    allergy ? t('ack.allergy') : '',
    allergy && warnings.interactions.length > 0 ? t('ack.and') : '',
    warnings.interactions.some((i) => SEVERE.includes(i.severity)) ? t('ack.major') : '',
  ].join('');
  return (
    <label className="flex items-start gap-2 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-[11px] text-rose-700 dark:text-rose-300 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <span>{t('ack.text', { what })}</span>
    </label>
  );
};

/**
 * Remaining blockers and the complete-sale button (F9).
 * Props: { blockers: string[], online, loading, disabled, total, onCheckout() }
 */
const CheckoutFooter = ({ blockers, online, loading, disabled, total, onCheckout }) => {
  const { t } = useTranslation('pos');
  return (
    <>
      {blockers.length > 0 && (
        <ul className="text-[11px] text-amber-700 dark:text-amber-400 space-y-0.5">
          {blockers.map((b) => (
            <li key={b}>• {b}</li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onCheckout}
        disabled={disabled}
        className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2"
      >
        {loading ? (
          t('checkout.processing')
        ) : (
          <>
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {t(online ? 'checkout.complete' : 'checkout.saveOffline', { total: formatMoney(total) })}
            </span>
          </>
        )}
      </button>
    </>
  );
};

export default CheckoutFooter;
