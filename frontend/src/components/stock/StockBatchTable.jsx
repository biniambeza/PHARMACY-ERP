import { Boxes, Plus } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';
import { CardSkeleton } from '../common/SkeletonLoader';
import StockBatchRow from './StockBatchRow';

// Batches table card for the Stock page: skeleton, empty state, rows and footer summary.
const StockBatchTable = ({
  loading,
  batches,
  totalCount,
  hasFilter,
  onStockIn,
  onAdjust,
  onDelete,
  deletingId,
}) => {
  const { t } = useTranslation('stock');

  return (
    <div className="bg-white dark:bg-[#161c26] border border-slate-100/90 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-8">
            <CardSkeleton height="h-64" />
          </div>
        ) : batches.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3 border border-emerald-100 dark:border-emerald-900/50">
              <Boxes className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              {hasFilter ? t('empty.noMatch') : t('empty.none')}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              {hasFilter ? t('empty.noMatchHint') : t('empty.noneHint')}
            </p>
            <button
              onClick={onStockIn}
              className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> {t('empty.recordFirst')}
            </button>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/75 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800 text-[11px]">
              <tr>
                <th className="py-3.5 px-5">{t('table.batchNo')}</th>
                <th className="py-3.5 px-4">{t('table.medicine')}</th>
                <th className="py-3.5 px-4">{t('table.available')}</th>
                <th className="py-3.5 px-4">{t('table.expiry')}</th>
                <th className="py-3.5 px-4">{t('table.unitCost')}</th>
                <th className="py-3.5 px-4">{t('table.valuation')}</th>
                <th className="py-3.5 px-4">{t('table.status')}</th>
                <th className="py-3.5 px-5 text-right">{t('common:labels.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/80 dark:divide-slate-800/60 font-medium">
              {batches.map((batch) => (
                <StockBatchRow
                  key={batch._id}
                  batch={batch}
                  onAdjust={onAdjust}
                  onDelete={onDelete}
                  deleting={deletingId === batch._id}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer Summary */}
      {batches.length > 0 && (
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-800/20">
          <span>
            <Trans
              t={t}
              i18nKey="page.footerShowing"
              values={{ shown: batches.length, total: totalCount }}
              components={{ b: <strong /> }}
            />
          </span>
          <span className="font-mono text-[11px]">
            {t('page.footerProtocol')}
          </span>
        </div>
      )}
    </div>
  );
};

export default StockBatchTable;
