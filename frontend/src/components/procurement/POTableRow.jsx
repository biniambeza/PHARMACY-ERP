import { Fragment } from 'react';
import { Truck, Building2, XCircle, Send, Ban, ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Can from '../common/Can';
import StatusBadge from '../common/StatusBadge';
import { formatMoney, formatDate } from '../../utils/format';
import PODetails from './PODetails';

const statusBadgeProps = (status, t) => {
  switch (status) {
    case 'ordered':
      return { status: 'ordered', label: t('status.pendingDelivery') };
    case 'partially_received':
      return { status: 'warning', label: t('status.partiallyReceived') };
    case 'closed':
      return { status: 'depleted', label: t('status.closedShort') };
    case 'draft':
      return { status, label: t('common:status.draft') };
    case 'received':
      return { status, label: t('common:status.received') };
    case 'cancelled':
      return { status, label: t('common:status.cancelled') };
    default:
      return { status };
  }
};

// One purchase order row plus its expandable detail row.
const POTableRow = ({
  po,
  expanded,
  onToggle,
  busyId,
  cancellingId,
  onSubmitDraft,
  onReceive,
  onCloseShort,
  onCancel,
}) => {
  const { t } = useTranslation('procurement');
  const productCount = po.items?.length || 0;
  const unitCount = po.items?.reduce((sum, it) => sum + it.quantityOrdered, 0);

  return (
    <Fragment>
      <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition group">
        <td className="py-3.5 pl-3 pr-0 align-top">
          <button
            onClick={onToggle}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded cursor-pointer"
            title={t('table.showDetails')}
          >
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </td>
        <td className="py-3.5 px-5">
          <span className="font-mono font-bold text-slate-900 dark:text-white block group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
            {po.poNumber}
          </span>
          {po.notes && (
            <span className="text-[10px] text-slate-400 truncate max-w-xs block">
              {po.notes}
            </span>
          )}
        </td>

        <td className="py-3.5 px-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <div>
              <span className="font-bold text-slate-900 dark:text-white block">
                {po.supplierId?.name || t('table.verifiedSupplier')}
              </span>
              {po.supplierId?.phone && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  {po.supplierId.phone}
                </span>
              )}
            </div>
          </div>
        </td>

        <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 font-mono">
          <div>
            <span>{new Date(po.orderDate).toLocaleDateString()}</span>
            {po.expectedDelivery && (
              <span className="text-[10px] text-slate-400 block">
                {t('table.expected', { date: new Date(po.expectedDelivery).toLocaleDateString() })}
              </span>
            )}
          </div>
        </td>

        <td className="py-3.5 px-4">
          <span className="text-slate-900 dark:text-white font-medium block">
            {t('table.productSummary', { count: productCount, units: unitCount })}
          </span>
          {(po.status === 'partially_received' || po.status === 'closed') && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono block">
              {t('table.receivedOf', {
                received: po.items?.reduce((s2, it) => s2 + (it.quantityReceived || 0), 0),
                ordered: po.items?.reduce((s2, it) => s2 + it.quantityOrdered, 0),
              })}
            </span>
          )}
          <span className="text-[10px] text-slate-400 truncate max-w-xs block">
            {po.items?.map((it) => `${it.name} (x${it.quantityOrdered})`).join(', ')}
          </span>
        </td>

        <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white text-sm">
          {formatMoney(po.totalAmount)}
        </td>

        <td className="py-3.5 px-4">
          <StatusBadge {...statusBadgeProps(po.status, t)} />
        </td>

        <td className="py-3.5 px-5 text-right">
          <div className="flex items-center justify-end gap-2">
            {po.status === 'draft' && (
              <Can perm="po:manage">
                <button
                  onClick={() => onSubmitDraft(po._id)}
                  disabled={busyId === po._id}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-[11px] font-semibold transition cursor-pointer shadow-xs"
                >
                  <Send className="w-3 h-3" /> {t('common:buttons.submit')}
                </button>
              </Can>
            )}
            {(po.status === 'ordered' || po.status === 'partially_received') && (
              <Can perm="po:receive">
                <button
                  onClick={() => onReceive(po)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-semibold transition cursor-pointer shadow-xs"
                >
                  <Truck className="w-3 h-3" /> {po.status === 'ordered' ? t('table.receiveStock') : t('table.receiveMore')}
                </button>
              </Can>
            )}
            {po.status === 'partially_received' && (
              <Can perm="po:manage">
                <button
                  onClick={() => onCloseShort(po)}
                  disabled={busyId === po._id}
                  className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded-lg transition disabled:opacity-40 cursor-pointer"
                  title={t('table.closeShortTitle')}
                >
                  <Ban className="w-4 h-4" />
                </button>
              </Can>
            )}
            {(po.status === 'draft' || po.status === 'ordered') && (
              <Can perm="po:manage">
                <button
                  onClick={() => onCancel(po._id, po.poNumber)}
                  disabled={cancellingId === po._id}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition disabled:opacity-40 cursor-pointer"
                  title={t('table.cancelTitle')}
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </Can>
            )}
            {po.status === 'received' && (
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">
                {t('table.receivedOn', { date: po.receivedDate ? formatDate(po.receivedDate) : '' })}
              </span>
            )}
            {po.status === 'closed' && (
              <span className="text-[11px] text-slate-500 font-mono">
                {t('table.closedOn', { date: po.closedAt ? formatDate(po.closedAt) : '' })}
              </span>
            )}
            {po.status === 'cancelled' && (
              <span className="text-[11px] text-rose-500 font-mono">{t('common:status.cancelled')}</span>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50/60 dark:bg-slate-800/30">
          <td colSpan={8} className="px-5 py-4">
            <PODetails po={po} />
          </td>
        </tr>
      )}
    </Fragment>
  );
};

export default POTableRow;
