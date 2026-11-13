import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ShieldAlert, Loader2, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { checkInteractions } from '../../api/clinicalApi';
import { severityCls, clinicalCheckKey } from './ui';

/**
 * Calls POST /api/interactions/check and renders severity-coloured warnings.
 * Props:
 *   patientId: string | null — adds allergy checks for that patient
 *   medicineIds: string[] — medicines in the cart (duplicates are ignored)
 *   onResult({ key, status, interactions, allergyHits }): optional; called whenever the state of
 *     the check changes. `key` = clinicalCheckKey(patientId, medicineIds) of the check,
 *     `status` = 'checking' | 'ok' | 'failed' (interactions / allergyHits are [] unless 'ok').
 *     The POS treats anything but status 'ok' for the current key as a blocker.
 *   compact: boolean (default false) — tighter layout for the POS sidebar
 * Renders nothing when there is nothing to warn about. A failed check shows a retry button.
 * Needs `sales:create` or `patient:view`.
 */
const ClinicalWarnings = ({ patientId, medicineIds = [], onResult, compact = false }) => {
  const { t } = useTranslation('interactions');
  const ids = useMemo(() => [...new Set((medicineIds || []).map(String))].sort(), [medicineIds]);
  const idsKey = ids.join(',');
  const requestKey = clinicalCheckKey(patientId, ids);
  const checkable = ids.length > 1 || (ids.length > 0 && Boolean(patientId));
  const [result, setResult] = useState({ key: '', status: 'checking', interactions: [], allergyHits: [] });
  const [attempt, setAttempt] = useState(0);
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    const report = (out) => {
      setResult(out);
      onResultRef.current?.(out);
    };
    if (!checkable) {
      onResultRef.current?.({ key: requestKey, status: 'ok', interactions: [], allergyHits: [] });
      return undefined;
    }
    // Reported right away so a checkout right after a cart change is blocked until the check ends
    onResultRef.current?.({ key: requestKey, status: 'checking', interactions: [], allergyHits: [] });
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const data = await checkInteractions({ patientId, medicineIds: idsKey.split(',') });
        if (cancelled) return;
        report({
          key: requestKey,
          status: 'ok',
          interactions: data.interactions || [],
          allergyHits: data.allergyHits || [],
        });
      } catch {
        if (!cancelled) report({ key: requestKey, status: 'failed', interactions: [], allergyHits: [] });
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [patientId, idsKey, requestKey, checkable, attempt]);

  // Results of an older request (or of an uncheckable cart) are not shown
  const current = checkable && result.key === requestKey;
  const loading = checkable && !current;
  const failed = current && result.status === 'failed';
  const interactions = current && result.status === 'ok' ? result.interactions : [];
  const allergyHits = current && result.status === 'ok' ? result.allergyHits : [];
  if (!loading && !failed && interactions.length === 0 && allergyHits.length === 0) return null;

  const pad = compact ? 'p-2' : 'p-3';
  return (
    <div className="space-y-2" role="alert">
      {loading && (
        <p className="text-[11px] text-slate-400 inline-flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> {t('warnings.checking')}
        </p>
      )}
      {failed && (
        <p className="text-[11px] text-amber-600 inline-flex items-center gap-2">
          <span>{t('checkFailed')}</span>
          <button
            type="button"
            onClick={() => {
              setResult((r) => ({ ...r, key: '' }));
              setAttempt((n) => n + 1);
            }}
            className="inline-flex items-center gap-1 font-semibold text-emerald-600 hover:text-emerald-500 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" /> {t('warnings.retry')}
          </button>
        </p>
      )}
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
