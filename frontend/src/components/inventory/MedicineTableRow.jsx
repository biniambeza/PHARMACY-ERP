import { Pill, Edit3, Trash2, ShieldAlert, ShieldCheck, History, ArrowLeftRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Can from '../common/Can';
import MarginBadge from '../catalog/MarginBadge';
import { formatMoney } from '../../utils/format';

// One medicine row in the catalog table.
const MedicineTableRow = ({ item, selected, onToggle, onHistory, onEdit, onDelete, deleting }) => {
  const { t } = useTranslation('medicines');
  const itemMargin = (Number(item.price) || 0) - (Number(item.costPrice) || 0);
  const marginPct = (Number(item.price) || 0) > 0
    ? ((itemMargin / item.price) * 100).toFixed(0)
    : 0;

  return (
    <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition group">
      <td className="py-3.5 pl-5 pr-1">
        <input
          type="checkbox"
          aria-label={t('table.selectItem', { name: item.name })}
          checked={selected}
          onChange={onToggle}
          className="accent-emerald-600 cursor-pointer"
        />
      </td>
      {/* Name & Generic */}
      <td className="py-3.5 px-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900/50">
            <Pill className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-slate-900 dark:text-white block group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
              {item.name}
            </span>
            {item.genericName ? (
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {item.genericName}
              </span>
            ) : (
              <span className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                {t('table.genericFormulation')}
              </span>
            )}
            {item.barcode && (
              <span className="block text-[10px] text-slate-400 font-mono">{item.barcode}</span>
            )}
          </div>
        </div>
      </td>

      {/* Category */}
      <td className="py-3.5 px-4">
        <span className="inline-block px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800/80 dark:text-slate-300 border border-slate-200/50 dark:border-slate-700/50">
          {item.category || t('table.generalCategory')}
        </span>
      </td>

      {/* Dosage & Strength */}
      <td className="py-3.5 px-4">
        <span className="text-slate-800 dark:text-slate-200 font-medium block">
          {item.dosageForm}
        </span>
        {item.strength && (
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            {item.strength}
          </span>
        )}
      </td>

      {/* Retail Price */}
      <td className="py-3.5 px-4">
        <span className="font-bold text-slate-900 dark:text-white font-mono text-sm block">
          {formatMoney(item.price)}
        </span>
        {item.costPrice > 0 && !item.marginWarning && (
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
            {t('table.marginPct', { percent: marginPct })}
          </span>
        )}
        <MarginBadge warning={item.marginWarning} />
        {item.packUnits?.length > 0 && (
          <span className="block text-[10px] text-slate-400 mt-0.5">
            {item.packUnits.map((p) => `${p.name} x${p.factor}`).join(', ')}
          </span>
        )}
      </td>

      {/* Cost Price */}
      <td className="py-3.5 px-4">
        <span className="text-slate-500 dark:text-slate-400 font-mono text-xs">
          {formatMoney(item.costPrice)}
        </span>
      </td>

      {/* Classification Rx / OTC */}
      <td className="py-3.5 px-4">
        {item.requiresPrescription ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 shadow-2xs">
            <ShieldAlert className="w-3 h-3 text-amber-500 shrink-0" />
            <span>{t('table.rxRequired')}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 shadow-2xs">
            <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0" />
            <span>{t('table.otc')}</span>
          </span>
        )}
      </td>

      {/* Actions */}
      <td className="py-3.5 px-5 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={onHistory}
            title={t('table.priceHistory')}
            className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-indigo-400 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
          >
            <History className="w-4 h-4" />
          </button>
          <Can perm="stock:view">
            <Link
              to={`/pharmacy/movements?medicineId=${item._id}`}
              title={t('table.stockMovements')}
              className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-indigo-400 dark:hover:bg-slate-800 rounded-lg transition"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </Link>
          </Can>
          <Can perm="medicine:manage">
            <button
              onClick={onEdit}
              title={t('table.editProduct')}
              className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-emerald-400 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              disabled={deleting}
              title={t('table.deleteProduct')}
              className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 dark:text-slate-400 dark:hover:text-rose-400 dark:hover:bg-rose-950/30 rounded-lg transition disabled:opacity-40 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </Can>
        </div>
      </td>
    </tr>
  );
};

export default MedicineTableRow;
