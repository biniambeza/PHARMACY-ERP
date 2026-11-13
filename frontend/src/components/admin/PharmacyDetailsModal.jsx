import { useTranslation } from 'react-i18next';
import StatusBadge from '../common/StatusBadge';

const tile = 'p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/60';
const tileLabel = 'text-[10px] text-slate-400 uppercase font-bold block';

// Tenant details popup opened from the admin pharmacies table.
const PharmacyDetailsModal = ({ pharmacy, onClose, onResetPassword, onOpenSupport }) => {
  const { t } = useTranslation('admin');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-[#161c26] rounded-2xl border border-slate-100/90 dark:border-slate-800/80 shadow-2xl max-w-lg w-full p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{pharmacy.name}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {t('dashboard.licenseShort', { licenseNo: pharmacy.licenseNo })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('buttons.close', { ns: 'common' })}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className={tile}>
            <span className={tileLabel}>{t('shared.status')}</span>
            <StatusBadge status={pharmacy.status} size="sm" />
          </div>
          <div className={tile}>
            <span className={tileLabel}>{t('dashboard.columns.activeBatches')}</span>
            <span className="text-sm font-bold text-slate-900 dark:text-white">
              {t('dashboard.lots', { count: pharmacy.activeBatches || 0 })}
            </span>
          </div>
          <div className={tile}>
            <span className={tileLabel}>{t('dashboard.detailsModal.phone')}</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{pharmacy.phone}</span>
          </div>
          <div className={tile}>
            <span className={tileLabel}>{t('dashboard.detailsModal.totalSales')}</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {t('dashboard.detailsModal.orders', { count: pharmacy.totalSales || 0 })}
            </span>
          </div>
        </div>

        <div className={`${tile} text-xs`}>
          <span className={tileLabel}>{t('shared.physicalAddress')}</span>
          <p className="text-slate-700 dark:text-slate-300 mt-0.5">{pharmacy.address}</p>
        </div>

        <div className={`${tile} text-xs`}>
          <span className={tileLabel}>{t('dashboard.detailsModal.primaryOperator')}</span>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p className="font-semibold text-slate-800 dark:text-slate-200">
              {pharmacy.owner?.name} ({pharmacy.owner?.email})
            </p>
            {pharmacy.owner?._id && (
              <button
                onClick={() => onResetPassword(pharmacy.owner)}
                className="px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-lg cursor-pointer shrink-0"
              >
                {t('shared.resetPassword')}
              </button>
            )}
          </div>
          <button
            onClick={onOpenSupport}
            className="mt-2 text-[11px] font-semibold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
          >
            {t('dashboard.detailsModal.otherStaffHint')}
          </button>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl transition"
          >
            {t('buttons.close', { ns: 'common' })}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PharmacyDetailsModal;
