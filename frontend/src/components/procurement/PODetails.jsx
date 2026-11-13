import { History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatMoney, formatDate } from '../../utils/format';

// Line progress and receipt (GRN) history for one order.
const PODetails = ({ po }) => {
  const { t } = useTranslation('procurement');
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
      <div>
        <h4 className="font-bold text-slate-900 dark:text-white mb-2">{t('details.lines')}</h4>
        <table className="w-full text-left">
          <thead className="text-[10px] uppercase tracking-wider text-slate-400">
            <tr>
              <th className="py-1 pr-2">{t('details.item')}</th>
              <th className="py-1 px-2 text-right">{t('details.ordered')}</th>
              <th className="py-1 px-2 text-right">{t('details.received')}</th>
              <th className="py-1 px-2 text-right">{t('details.bonus')}</th>
              <th className="py-1 pl-2 text-right">{t('details.unitCost')}</th>
            </tr>
          </thead>
          <tbody className="font-mono text-slate-700 dark:text-slate-300">
            {po.items?.map((it) => {
              // Orders received before partial receiving existed have no per-line counts.
              const received =
                po.status === 'received' && !it.quantityReceived ? it.quantityOrdered : it.quantityReceived || 0;
              return (
                <tr key={it._id || it.medicineId} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-1 pr-2 font-sans">{it.name}</td>
                  <td className="py-1 px-2 text-right">{it.quantityOrdered}</td>
                  <td
                    className={`py-1 px-2 text-right ${
                      received < it.quantityOrdered ? 'text-amber-600 dark:text-amber-400' : ''
                    }`}
                  >
                    {received}
                  </td>
                  <td className="py-1 px-2 text-right">{it.bonusQuantity || 0}</td>
                  <td className="py-1 pl-2 text-right">{formatMoney(it.unitCost)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {po.status === 'closed' && (
          <p className="mt-2 text-[11px] text-slate-500">
            {po.closeReason ? t('details.closedShortReason', { reason: po.closeReason }) : t('details.closedShort')}
          </p>
        )}
      </div>
      <div>
        <h4 className="font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
          <History className="w-3.5 h-3.5" /> {t('details.receiptHistory')}
        </h4>
        {!po.receipts || po.receipts.length === 0 ? (
          <p className="text-slate-400">{t('details.noDeliveries')}</p>
        ) : (
          <div className="space-y-2">
            {po.receipts.map((r) => (
              <div
                key={r._id || r.receiptNo}
                className="p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-900/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{r.receiptNo}</span>
                  <span className="text-[11px] text-slate-500">
                    {formatDate(r.date)}
                    {r.receivedBy?.name ? ` ${t('details.by', { name: r.receivedBy.name })}` : ''}
                  </span>
                </div>
                {r.supplierInvoiceNo && (
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {t('details.supplierInvoice')} <span className="font-mono">{r.supplierInvoiceNo}</span>
                    {r.supplierInvoiceDate ? ` (${formatDate(r.supplierInvoiceDate)})` : ''}
                  </p>
                )}
                <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                  {r.lines?.map((l, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span>
                        {l.name} <span className="font-mono text-slate-400">#{l.batchNo}</span>
                      </span>
                      <span className="font-mono">
                        {l.quantity}
                        {l.bonusQuantity ? ` ${t('details.plusBonus', { qty: l.bonusQuantity })}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-right text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-200 mt-1">
                  {formatMoney(r.totalCost)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PODetails;
