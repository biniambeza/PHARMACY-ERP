# i18n

`react-i18next` setup for English (`en`, default), Amharic (`am`) and Afaan Oromo (`om`).

> **Translations need review by a native speaker.** The Amharic and Afaan Oromo strings in
> `locales/am` and `locales/om` are best-effort machine-assisted translations written by a
> developer. Please have a native Amharic and Afaan Oromo speaker (ideally one familiar with
> pharmacy/ERP vocabulary) review every file before production use. The Oromo era suffix
> `A.L.I.` used by `formatEthiopianDate(..., 'om')` should also be confirmed.

## Files

- `index.js` – initialises i18next (imported once by `main.jsx`). Exports `setLanguage(lng)`,
  `applyPharmacySettings(settings)`, `SUPPORTED_LANGUAGES`, `normalizeLanguage`, `LANG_KEY`.
- `locales/<lng>/{common,nav,auth}.json` – namespaces. `common` is the default namespace.
- `nav.js` – `tNav(t, item)`, `tNavGroup(t, label)`, `tQuickAction(t, item)` for
  `config/navigation.js`.
- `LocaleSync.jsx` – renders nothing; loads `/api/pharmacy/my-pharmacy` and applies the
  pharmacy currency and default language. Mount once inside `AuthProvider` (PharmacyLayout).
- `ethiopianCalendar.js` – re-exports `src/utils/ethiopianCalendar.js` (pure Gregorian <->
  Ethiopian conversion, also exposed as `formatEthiopianDate` in `utils/format.js`).
- Display calendar: `CalendarSwitcher` (rendered by `LanguageSwitcher`) calls
  `setCalendarPreference('gregorian' | 'ethiopian')`. It is saved per device in
  `localStorage.calendar`; without a saved choice Amharic uses the Ethiopian calendar and other
  languages use the Gregorian one. Only `formatDate` / `formatDateTime` change: API values and
  `<input type="date">` stay Gregorian ISO. Use `ethiopianDateHint(iso)` for a hint next to a date input.
- Amharic terminology: see `docs/AMHARIC_GLOSSARY.md`.

## Language resolution

1. Explicit user choice (`LanguageSwitcher` → `localStorage.lang`).
2. Pharmacy `settings.locale` (via `applyPharmacySettings`).
3. `en`.

`<html lang>` and the `utils/format.js` locale follow the active language.

## Key scheme

- `common:buttons.*`, `common:status.*`, `common:labels.*`, `common:languages.*`
- `auth:*` (login / password reset screens)
- `nav:items.<last path segment>` (`/pharmacy` → `overview`), `nav:groups.<lower-case label>`,
  `nav:quickActions.<slug of name>`

Usage:

```jsx
const { t } = useTranslation();          // common
t('buttons.save');
t('auth:signIn');
tNav(t, item);                            // sidebar label with English fallback
```

## Tests

From `frontend/`: `node --test src/i18n/__tests__/ethiopianCalendar.test.js`
