import { AlertCircle, Info, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const TONES = {
  error: {
    box: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400',
    icon: AlertCircle,
  },
  info: {
    box: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300',
    icon: Info,
  },
};

// Dismissible error / info banner of the POS. Props: { tone: 'error'|'info', message, onClose }
const PosNotice = ({ tone, message, onClose }) => {
  const { t } = useTranslation('pos');
  if (!message) return null;
  const { box, icon: Icon } = TONES[tone] || TONES.info;
  return (
    <div className={`p-3 rounded-xl ${box} border text-xs flex justify-between items-center`}>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 shrink-0" />
        <span>{message}</span>
      </div>
      <button type="button" onClick={onClose} className="p-1 cursor-pointer" aria-label={t('dismiss')}><X className="w-4 h-4" /></button>
    </div>
  );
};

export default PosNotice;
