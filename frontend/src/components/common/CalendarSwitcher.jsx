import { CalendarDays } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { setCalendarPreference } from '../../i18n';
import { CALENDARS, getCalendar } from '../../utils/format';

// Display-calendar picker (Gregorian / Ethiopian), saved per device. Only affects how dates
// are shown (formatDate/formatDateTime); dates sent to the API stay Gregorian ISO.
const CalendarSwitcher = ({ className = '' }) => {
  // useTranslation re-renders this (and every translated component) when the calendar
  // changes, because setCalendarPreference re-emits languageChanged.
  const { t } = useTranslation('common');
  const current = getCalendar();

  return (
    <label
      className={`flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-full text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-emerald-400 transition ${className}`}
      title={t('calendar')}
    >
      <CalendarDays className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
      <span className="sr-only">{t('calendar')}</span>
      <select
        value={current}
        onChange={(e) => setCalendarPreference(e.target.value)}
        className="bg-transparent outline-none cursor-pointer pr-1 dark:[color-scheme:dark]"
        aria-label={t('calendar')}
      >
        {CALENDARS.map((c) => (
          <option key={c} value={c} className="text-slate-800">
            {t(`calendars.${c}`)}
          </option>
        ))}
      </select>
    </label>
  );
};

export default CalendarSwitcher;
