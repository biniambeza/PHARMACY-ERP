import { Pill, Plus } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';
import { CardSkeleton } from '../common/SkeletonLoader';
import MedicineTableRow from './MedicineTableRow';

// Catalog table card: loading skeleton, empty state, rows and footer summary.
const MedicineTable = ({
  loading,
  medicines,
  filteredMedicines,
  hasFilters,
  selectedIds,
  allVisibleSelected,
  onToggleAll,
  onToggle,
  onCreate,
  onEdit,
  onDelete,
  onHistory,
  deletingId,
}) => {
  const { t } = useTranslation('medicines');

  return (
    <div className="bg-white dark:bg-[#161c26] border border-slate-100/90 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-8">
            <CardSkeleton height="h-64" />
          </div>
        ) : filteredMedicines.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3 border border-emerald-100 dark:border-emerald-900/50">
              <Pill className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              {hasFilters ? t('table.noMatchTitle') : t('table.emptyTitle')}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              {hasFilters ? t('table.noMatchHint') : t('table.emptyHint')}
            </p>
            <button
              onClick={onCreate}
              className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> {t('table.addFirst')}
            </button>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/75 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800 text-[11px]">
              <tr>
                <th className="py-3.5 pl-5 pr-1 w-8">
                  <input
                    type="checkbox"
                    aria-label={t('table.selectAll')}
                    checked={allVisibleSelected}
                    onChange={onToggleAll}
                    className="accent-emerald-600 cursor-pointer"
                  />
                </th>
                <th className="py-3.5 px-4">{t('table.colMedicine')}</th>
                <th className="py-3.5 px-4">{t('table.colCategory')}</th>
                <th className="py-3.5 px-4">{t('table.colDosage')}</th>
                <th className="py-3.5 px-4">{t('table.colRetail')}</th>
                <th className="py-3.5 px-4">{t('table.colCost')}</th>
                <th className="py-3.5 px-4">{t('table.colClass')}</th>
                <th className="py-3.5 px-5 text-right">{t('common:labels.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/80 dark:divide-slate-800/60 font-medium">
              {filteredMedicines.map((item) => (
                <MedicineTableRow
                  key={item._id}
                  item={item}
                  selected={selectedIds.has(item._id)}
                  onToggle={() => onToggle(item._id)}
                  onHistory={() => onHistory(item)}
                  onEdit={() => onEdit(item)}
                  onDelete={() => onDelete(item._id, item.name)}
                  deleting={deletingId === item._id}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer Summary */}
      {filteredMedicines.length > 0 && (
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-800/20">
          <span>
            <Trans
              t={t}
              i18nKey="table.showing"
              values={{ shown: filteredMedicines.length, total: medicines.length }}
              components={{ 1: <strong />, 3: <strong /> }}
            />
          </span>
          <span className="font-mono text-[11px]">
            {t('table.catalogId', { n: medicines.length })}
          </span>
        </div>
      )}
    </div>
  );
};

export default MedicineTable;
