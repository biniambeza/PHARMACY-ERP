import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ShieldAlert, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { checkInteractions } from '../../api/clinicalApi';
import { severityCls } from './ui';

/**
 * Calls POST /api/interactions/check and renders severity-coloured warnings.
 * Props:
 *   patientId: string | null — adds allergy checks for that patient
 *   medicineIds: string[] — medicines in the cart (duplicates are ignored)
 *   onResult({ interactions, allergyHits }): optional; called after every check
 *     (e.g. the POS can require confirmation when anything is 'major'/'contraindicated')
 *   compact: boolean (default false) — tighter layout for the POS sidebar
 * Renders nothing when there is nothing to warn about.
 * Needs `sales:create` or `patient:view`.
 */
const ClinicalWarnings = ({ patientId, medicineIds = [], onResult, compact = false }) => {
  const { t } = useTranslation('interactions');
  const key = useMemo(() => [...new Set((medicineIds || []).map(String))].sort().join(','), [medicineIds]);
  const [result, setResult] = useState({ interactions: [], allergyHits: [], key: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const requestKey = `${patientId || ''}|${key}`;
  const checkable = Boolean(key) && (key.includes(',') || Boolean(patientId));

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    if (!checkable) {
      onResult?.({ interactions: [], allergyHits: [] });
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const data = await checkInteractions({ patientId, medicineIds: ids });
        if (cancelled) return;
        const out = { interactions: data.interactions || [], allergyHits: data.allergyHits || [] };
        setResult({ ...out, key: requestKey });
        onResult?.(out);
      } catch {
        if (!cancelled) setError('checkFailed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // onResult is intentionally not a dependency (callers often pass inline functions)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, key]);

  // Results of an older request (or of an uncheckable cart) are not shown
  const current = checkable && result.key === requestKey;
  const interactions = current ? result.interactions : [];
  const allergyHits = current ? result.allergyHits : [];
  const showLoading = checkable && loading;
  const showError = checkable && error;
  if (!showLoading && !showError && interactions.length === 0 && allergyHits.length === 0) return null;

  const pad = compact ? 'p-2' : 'p-3';
  return (
    <div className="space-y-2" role="alert">
      {showLoading && (
        <p className="text-[11px] text-slate-400 inline-flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> {t('warnings.checking')}
        </p>
      )}
      {showError && <p className="text-[11px] text-amber-600">{t(error)}</p>}
      {allergyHits.map((h, i) => (
        <div key={`al-${i}`} className={`${pad} rounded-xl border text-xs ${severityCls(h.allergy?.severity === 'unknown' ? 'severe' : h.allergy?.severity)}`}>
          <div className="flex items-center gap-1.5 font-bold">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            {t('warnings.allergy', { medicine: h.medicineName, substance: h.allergy?.substance })}
          </div>
          {!compact && h.allergy?.reaction && <p className="mt-0.5 opacity-90">{t('warnings.reaction', { reaction: h.allergy.reaction })}</p>}
        </div>
      ))}
      {interactions.map((it, i) => (
        <div key={`ix-${i}`} className={`${pad} rounded-xl border text-xs ${severityCls(it.severity)}`}>
          <div className="flex items-center gap-1.5 font-bold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="uppercase text-[10px] tracking-wider">{t(`severity.${it.severity}`, { defaultValue: it.severity })}</span>
            <span className="truncate">
              {it.a} + {it.b}
            </span>
          </div>
          {!compact && it.description && <p className="mt-0.5 opacity-90">{it.description}</p>}
        </div>
      ))}
      {!compact && (interactions.length > 0 || allergyHits.length > 0) && (
        <p className="text-[10px] text-slate-400">{t('warnings.disclaimer')}</p>
      )}
    </div>
  );
};

export default ClinicalWarnings;
