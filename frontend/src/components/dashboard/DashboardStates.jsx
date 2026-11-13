import { useTranslation } from 'react-i18next';
import { MetricCardSkeleton, CardSkeleton } from '../common/SkeletonLoader';

export const DashboardSkeleton = () => (
  <div className="space-y-6 sm:space-y-8 animate-fade-in">
    {/* Row 1 Skeletons */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
      <MetricCardSkeleton />
      <MetricCardSkeleton />
      <MetricCardSkeleton />
      <MetricCardSkeleton />
    </div>
    {/* Row 2 Skeletons */}
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-6">
        <CardSkeleton height="h-80" />
      </div>
      <div className="lg:col-span-6">
        <CardSkeleton height="h-80" />
      </div>
    </div>
    {/* Row 3 Skeletons */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <CardSkeleton height="h-72" />
      <CardSkeleton height="h-72" />
      <CardSkeleton height="h-72" />
    </div>
  </div>
);

export const DashboardError = ({ error, onRetry }) => {
  const { t } = useTranslation('dashboard');
  return (
    <div className="p-8 bg-white dark:bg-[#161c26] rounded-2xl border border-rose-200 dark:border-rose-900/50 text-center space-y-3 shadow-xs">
      <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      </div>
      <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('error.title')}</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">{error || t('error.noData')}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
      >
        {t('error.retry')}
      </button>
    </div>
  );
};
