// i18next + react-i18next setup. Imported once from main.jsx (side effect: init).
//
// Languages: en (default), am (Amharic), om (Afaan Oromo).
// Namespaces: common (default), nav, auth.
// Language choice order: localStorage[LANG_KEY] (explicit user choice)
//   -> pharmacy settings.locale (applyPharmacySettings) -> 'en'.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { setCalendar, setDefaultCurrency, setDefaultLocale } from '../utils/format.js';

// Every locales/<lang>/<namespace>.json file is picked up automatically, so a
// new namespace only needs its JSON files (no change here).
const localeModules = import.meta.glob('./locales/*/*.json', { eager: true, import: 'default' });
const resources = {};
const namespaces = new Set();
for (const [path, messages] of Object.entries(localeModules)) {
  const match = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (!match) continue;
  const [, lang, ns] = match;
  resources[lang] = resources[lang] || {};
  resources[lang][ns] = messages;
  namespaces.add(ns);
}

export const LANG_KEY = 'lang';
export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'am', label: 'አማርኛ' },
  { code: 'om', label: 'Afaan Oromoo' },
];
const SUPPORTED = SUPPORTED_LANGUAGES.map((l) => l.code);

export const normalizeLanguage = (lng) => {
  const base = String(lng || '').toLowerCase().slice(0, 2);
  return SUPPORTED.includes(base) ? base : null;
};

const readStoredLanguage = () => {
  try {
    return normalizeLanguage(localStorage.getItem(LANG_KEY));
  } catch {
    return null;
  }
};

const applyDocumentLanguage = (lng) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lng;
  setDefaultLocale(lng);
};

const initialLanguage = readStoredLanguage() || 'en';

i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: 'en',
  supportedLngs: SUPPORTED,
  ns: [...namespaces],
  defaultNS: 'common',
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
});

applyDocumentLanguage(initialLanguage);
i18n.on('languageChanged', (lng) => applyDocumentLanguage(normalizeLanguage(lng) || 'en'));

/** Explicit user choice (LanguageSwitcher): persisted, wins over pharmacy default. */
export const setLanguage = (lng) => {
  const code = normalizeLanguage(lng) || 'en';
  try {
    localStorage.setItem(LANG_KEY, code);
  } catch {
    /* storage unavailable: still switch for this session */
  }
  return i18n.changeLanguage(code);
};

/**
 * Explicit display-calendar choice (CalendarSwitcher): 'gregorian' | 'ethiopian', saved per
 * device. Re-emits languageChanged (same language) so every useTranslation() consumer
 * re-renders and formatDate() picks up the new calendar.
 */
export const setCalendarPreference = (calendar) => {
  const active = setCalendar(calendar);
  i18n.changeLanguage(i18n.resolvedLanguage || i18n.language);
  return active;
};

/**
 * Apply a pharmacy's settings ({ currency, locale }) after loading
 * GET /api/pharmacy/my-pharmacy (or after saving Settings).
 * The pharmacy locale is only used when the user has not picked a language.
 */
export const applyPharmacySettings = (settings) => {
  if (!settings) return;
  if (settings.currency) setDefaultCurrency(settings.currency);
  const pharmacyLang = normalizeLanguage(settings.locale);
  if (pharmacyLang && !readStoredLanguage() && i18n.language !== pharmacyLang) {
    i18n.changeLanguage(pharmacyLang);
  }
};

export default i18n;
