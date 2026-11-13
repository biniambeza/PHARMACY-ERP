import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, normalizeLanguage, setLanguage } from '../../i18n';

// Compact language picker. Persists the choice to localStorage and sets <html lang>
// (both handled by setLanguage in src/i18n). Works on public pages (login) too.
const LanguageSwitcher = ({ className = '' }) => {
  const { t, i18n } = useTranslation('common');
  const current = normalizeLanguage(i18n.resolvedLanguage || i18n.language) || 'en';

  return (
    <label
      className={`flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-full text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-emerald-400 transition ${className}`}
      title={t('language')}
    >
      <Languages className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
      <span className="sr-only">{t('language')}</span>
      <select
        value={current}
        onChange={(e) => setLanguage(e.target.value)}
        className="bg-transparent outline-none cursor-pointer pr-1 dark:[color-scheme:dark]"
        aria-label={t('language')}
      >
        {SUPPORTED_LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} className="text-slate-800">
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
};

export default LanguageSwitcher;
