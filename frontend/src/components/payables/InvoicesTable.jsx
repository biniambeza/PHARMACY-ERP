import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatMoney, formatDate } from '../../utils/format';
import { thCls, theadCls, tbodyCls, payBtnCls, balanceOf, isOverdue } from './payablesUtils';

const InvoicesTable = ({ invoices, canPay, supplierName, outstandingFor, onPay, onDelete }) => {
  const { t } = useTranslation('payables');

  if (invoices.length === 0) {
    return <p className="py-16 text-center text-xs text-slate-500">{t('empty.invoices')}</p>;
  }

  return (
    <table className="w-full text-left text-xs">
      <thead className={theadCls}>
        <tr>
          <th className={thCls}>{t('columns.invoice')}</th>
          <th className={thCls}>{t('columns.supplier')}</th>
          <th className={thCls}>{t('columns.date')}</th>
          <th className={thCls}>{t('columns.due')}</th>
          <th className={`${thCls} text-right`}>{t('columns.amount')}</th>
          <th className={`${thCls} text-right`}>{t('columns.paid')}</th>
          <th className={`${thCls} text-right`}>{t('columns.balance')}</th>
          <th className={thCls}>{t('columns.status')}</th>
          <th className={`${thCls} text-right`}>{t('common:labels.actions')}</th>
        </tr>
      </thead>
      <tbody className={tbodyCls}>
        {invoices.map((inv) => {
          const overdue = isOverdue(inv);
          const sid = inv.supplierId?._id || inv.supplierId;
          const statusKey = inv.status !== 'paid' && overdue ? 'overdue' : inv.status;
          return (
            <tr key={inv._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
              <td className="py-3 px-4">
                <span className="font-mono font-bold text-slate-900 dark:text-white">{inv.invoiceNo}</span>
                {inv.purchaseOrderId?.poNumber && (
                  <span className="block text-[10px] text-slate-400">
                    {t('poRef', { poNumber: inv.purchaseOrderId.poNumber })}
                  </span>
                )}
              </td>
              <td className="py-3 px-4">{inv.supplierId?.name || supplierName(sid)}</td>
              <td className="py-3 px-4 whitespace-nowrap">{formatDate(inv.invoiceDate)}</td>
              <td className={`py-3 px-4 whitespace-nowrap ${overdue ? 'text-rose-600 dark:text-rose-400 font-semibold' : ''}`}>
                {formatDate(inv.dueDate)}
              </td>
              <td className="py-3 px-4 text-right">{formatMoney(inv.amount)}</td>
              <td className="py-3 px-4 text-right">{formatMoney(inv.amountPaid)}</td>
              <td className="py-3 px-4 text-right font-bold">{formatMoney(balanceOf(inv))}</td>
              <td className="py-3 px-4">
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full border capitalize ${
                    inv.status === 'paid'
                      ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800'
                      : overdue
                        ? 'text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-950/40 dark:border-rose-800'
                        : 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-800'
                  }`}
                >
                  {t(`invoiceStatus.${statusKey}`, { defaultValue: statusKey })}
                </span>
              </td>
              <td className="py-3 px-4 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  {canPay && inv.status !== 'paid' && (
                    <button
                      onClick={() =>
                        onPay({
                          supplierId: sid,
                          supplierName: inv.supplierId?.name || supplierName(sid),
                          outstanding: outstandingFor(sid),
                          invoice: inv,
                        })
                      }
                      className={payBtnCls}
                    >
                      {t('pay')}
                    </button>
                  )}
                  {canPay && !(inv.amountPaid > 0) && (
                    <button
                      onClick={() => onDelete(inv)}
                      title={t('deleteInvoice')}
                      aria-label={t('deleteInvoice')}
                      className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

export default InvoicesTable;
