import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import SecurityCard from '../../components/settings/SecurityCard';

// Admin's own two-factor login settings (same card as the pharmacy Settings page).
const SecurityModal = ({ isOpen, onClose }) => {
  const { t } = useTranslation('security');
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
      <div className="relative max-w-lg w-full max-h-[90vh] overflow-y-auto custom-scrollbar rounded-2xl shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close')}
          className="absolute top-4 right-4 z-10 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
        <SecurityCard />
      </div>
    </div>
  );
};

export default SecurityModal;
