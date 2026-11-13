import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// warning comes from the API (marginWarning) or marginWarningFor():
// 'below_cost' | 'below_min_margin' | null
const MarginBadge = ({ warning }) => {
  const { t } = useTranslation('medicines');
  if (!warning) return null;
  const danger = warning === 'below_cost';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
        danger
          ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60'
          : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60'
      }`}
    >
      <AlertTriangle className="w-3 h-3" />
      {t(`margin.${warning}`, { defaultValue: warning })}
    </span>
  );
};

export default MarginBadge;
