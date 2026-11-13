// i18next + react-i18next setup. Imported once from main.jsx (side effect: init).
//
// Languages: en (default), am (Amharic), om (Afaan Oromo).
// Namespaces: common (default), nav, auth.
// Language choice order: localStorage[LANG_KEY] (explicit user choice)
//   -> pharmacy settings.locale (applyPharmacySettings) -> 'en'.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { setDefaultCurrency, setDefaultLocale } from '../utils/format.js';

import enCommon from './locales/en/common.json';
import enNav from './locales/en/nav.json';
import enAuth from './locales/en/auth.json';
import amCommon from './locales/am/common.json';
import amNav from './locales/am/nav.json';
import amAuth from './locales/am/auth.json';
import omCommon from './locales/om/common.json';
import omNav from './locales/om/nav.json';
import omAuth from './locales/om/auth.json';

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
  resources: {
    en: { common: enCommon, nav: enNav, auth: enAuth },
    am: { common: amCommon, nav: amNav, auth: amAuth },
    om: { common: omCommon, nav: omNav, auth: omAuth },
  },
  lng: initialLanguage,
  fallbackLng: 'en',
  supportedLngs: SUPPORTED,
  ns: ['common', 'nav', 'auth'],
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
