import { AlertTriangle, SlidersHorizontal, Trash2, Clock, Pill, History } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import StatusBadge from '../common/StatusBadge';
import { formatMoney, formatDate } from '../../utils/format';
import { getDaysUntilExpiry } from './stockUtils';

// One stock batch (lot) row in the Stock page table.
const StockBatchRow = ({ batch, onAdjust, onDelete, deleting }) => {
  const { t } = useTranslation('stock');
  const daysLeft = getDaysUntilExpiry(batch.expiryDate);
  const isExpired = daysLeft !== null && daysLeft <= 0;
  const isCritical = daysLeft !== null && daysLeft > 0 && daysLeft <= 30;
  const isDepleted = Number(batch.quantity) <= 0;

  return (
    <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition group">
      {/* Batch Lot No */}
      <td className="py-3.5 px-5">
        <span className="font-mono font-bold text-slate-900 dark:text-white block group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
          {batch.batchNo}
        </span>
        <span className="text-[10px] text-slate-400 font-mono">
          {batch._id?.slice(-6).toUpperCase()}
        </span>
      </td>

      {/* Medicine Item */}
      <td className="py-3.5 px-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900/50">
            <Pill className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="font-bold text-slate-900 dark:text-white block">
              {batch.medicineId?.name || t('table.unnamed')}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {batch.medicineId?.dosageForm || t('table.unit')} • {batch.medicineId?.category || t('table.general')}
            </span>
          </div>
        </div>
      </td>

      {/* Quantity */}
      <td className="py-3.5 px-4">
        <div className="flex items-center gap-2">
          <span className={`font-mono font-bold text-sm ${
            isDepleted
              ? 'text-slate-400'
              : batch.quantity <= (batch.medicineId?.minStockLevel || 10)
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-slate-900 dark:text-white'
          }`}>
            {batch.quantity}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">{t('table.units')}</span>
        </div>
      </td>

      {/* Expiration Date with FEFO Tag */}
      <td className="py-3.5 px-4">
        <div className="space-y-1">
          <span className="text-slate-800 dark:text-slate-200 font-medium block">
            {batch.expiryDate
              ? formatDate(batch.expiryDate)
              : t('table.na')}
          </span>
          {isExpired ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
              <AlertTriangle className="w-3 h-3 text-rose-500" /> {t('common:status.expired')}
            </span>
          ) : isCritical ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              <Clock className="w-3 h-3 text-amber-500" /> {t('table.daysRemaining', { count: daysLeft })}
            </span>
          ) : daysLeft !== null ? (
            <span className="text-[10px] text-slate-400 font-mono">
              {t('table.daysValid', { count: daysLeft })}
            </span>
          ) : null}
        </div>
      </td>

      {/* Unit Cost */}
      <td className="py-3.5 px-4">
        <span className="font-mono text-slate-600 dark:text-slate-300">
          {formatMoney(Number(batch.purchasePrice || 0))}
        </span>
      </td>

      {/* Batch Valuation */}
      <td className="py-3.5 px-4">
        <span className="font-mono font-bold text-slate-900 dark:text-white">
          {formatMoney((Number(batch.quantity) || 0) * (Number(batch.purchasePrice) || 0))}
        </span>
      </td>

      {/* Status */}
      <td className="py-3.5 px-4">
        {isDepleted ? (
          <StatusBadge status="depleted" label={t('filters.depleted')} />
        ) : isExpired ? (
          <StatusBadge status="out_of_stock" label={t('common:status.expired')} />
        ) : isCritical ? (
          <StatusBadge status="warning" label={t('table.expiring')} />
        ) : (
          <StatusBadge status="active" label={t('table.availableStatus')} />
        )}
      </td>

      {/* Actions */}
      <td className="py-3.5 px-5 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <Link
            to={`/pharmacy/movements?batchId=${batch._id}`}
            title={t('actions.history')}
            className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 dark:text-slate-400 dark:hover:text-indigo-400 dark:hover:bg-indigo-950/30 rounded-lg transition"
          >
            <History className="w-4 h-4" />
          </Link>
          {!isDepleted && (
            <button
              onClick={() => onAdjust(batch)}
              title={t('actions.adjust')}
              className="p-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-50 dark:text-slate-400 dark:hover:text-amber-400 dark:hover:bg-amber-950/30 rounded-lg transition cursor-pointer"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => onDelete(batch._id, batch.batchNo)}
            disabled={deleting}
            title={t('actions.delete')}
            className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 dark:text-slate-400 dark:hover:text-rose-400 dark:hover:bg-rose-950/30 rounded-lg transition disabled:opacity-40 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
};

export default StockBatchRow;
