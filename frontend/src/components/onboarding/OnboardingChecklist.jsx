import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Circle, ChevronRight, Rocket, X } from 'lucide-react';
import { getOnboardingStatus, dismissOnboarding } from '../../api/onboardingApi';

/**
 * First-run setup checklist for owners. Renders nothing for other roles, once every
 * required step is done, or after it was dismissed (server decides via `show`).
 */
const OnboardingChecklist = () => {
  const { t } = useTranslation('onboarding');
  const [status, setStatus] = useState(null);
  const [dismissing, setDismissing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getOnboardingStatus();
      setStatus(res.onboarding || null);
    } catch {
      // Older backend or no access: the dashboard works without the checklist
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const dismiss = async () => {
    setDismissing(true);
    try {
      const res = await dismissOnboarding();
      setStatus(res.onboarding || null);
    } catch {
      setDismissing(false);
    }
  };

  if (!status || !status.show) return null;

  return (
    <section className="bg-white dark:bg-[#161c26] rounded-2xl border border-emerald-200/80 dark:border-emerald-900/60 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
            <Rocket className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('title')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('progress', { done: status.done, total: status.total })}
            </p>
          </div>
        </div>
        {status.canDismiss && (
          <button
            type="button"
            onClick={dismiss}
            disabled={dismissing}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" /> {t('dismiss')}
          </button>
        )}
      </div>

      <div
        className="mt-4 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={status.percent}
        aria-label={t('title')}
      >
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${status.percent}%` }} />
      </div>

      <ul className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
        {status.steps.map((step) => (
          <li key={step.key}>
            <Link
              to={step.link}
              className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs transition ${
                step.done
                  ? 'border-slate-100 dark:border-slate-800 text-slate-400'
                  : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-800 text-slate-700 dark:text-slate-200'
              }`}
            >
              {step.done
                ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                : <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />}
              <span className="flex-1 min-w-0">
                <span className={`block font-semibold ${step.done ? 'line-through' : ''}`}>{t(`steps.${step.key}.title`)}</span>
                {!step.done && <span className="block text-[11px] text-slate-500 dark:text-slate-400">{t(`steps.${step.key}.hint`)}</span>}
              </span>
              {step.optional && <span className="text-[10px] uppercase tracking-wider text-slate-400">{t('optional')}</span>}
              {!step.done && <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default OnboardingChecklist;
