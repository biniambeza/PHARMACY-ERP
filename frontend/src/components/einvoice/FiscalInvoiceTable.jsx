import { useTranslation } from 'react-i18next';
import { Eye, Send, RotateCw } from 'lucide-react';
import { formatMoney, formatDateTime } from '../../utils/format';
import FiscalStatusBadge from './FiscalStatusBadge';

const SUBMITTABLE = ['unsubmitted', 'pending', 'failed', 'rejected', 'not_required'];

/** Sales with their fiscal status, with submit / retry / details actions. */
const FiscalInvoiceTable = ({ sales, loading, busyId, enabled, onSubmit, onView }) => {
  const { t } = useTranslation('einvoice');

  if (!loading && sales.length === 0) {
    return <p className="py-10 text-center text-xs text-slate-400">{t('table.empty')}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[11px] text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
            <th className="text-left font-semibold py-2 px-3">{t('table.invoice')}</th>
            <th className="text-left font-semibold py-2 px-3">{t('table.date')}</th>
            <th className="text-left font-semibold py-2 px-3">{t('table.customer')}</th>
            <th className="text-right font-semibold py-2 px-3">{t('table.tax')}</th>
            <th className="text-right font-semibold py-2 px-3">{t('table.total')}</th>
            <th className="text-left font-semibold py-2 px-3">{t('table.status')}</th>
            <th className="text-left font-semibold py-2 px-3">{t('table.fiscalNumber')}</th>
            <th className="text-right font-semibold py-2 px-3">{t('common:labels.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((s) => {
            const status = s.voided ? null : s.fiscalStatus;
            const canSubmit = enabled && !s.voided && SUBMITTABLE.includes(s.fiscalStatus);
            const retry = ['failed', 'rejected'].includes(s.fiscalStatus);
            return (
              <tr key={s._id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                <td className="py-2 px-3 font-mono font-semibold text-slate-800 dark:text-slate-100">{s.invoiceNumber}</td>
                <td className="py-2 px-3 text-slate-500">{formatDateTime(s.createdAt)}</td>
                <td className="py-2 px-3 text-slate-700 dark:text-slate-200">{s.customer?.name || t('table.walkIn')}</td>
                <td className="py-2 px-3 text-right font-mono">{formatMoney(s.tax)}</td>
                <td className="py-2 px-3 text-right font-mono font-semibold">{formatMoney(s.grandTotal)}</td>
                <td className="py-2 px-3">
                  {status ? <FiscalStatusBadge status={status} /> : <span className="text-[11px] text-slate-400">{t('table.voided')}</span>}
                  {s.fiscal?.lastError && (
                    <p className="mt-1 max-w-[220px] truncate text-[10px] text-rose-600" title={s.fiscal.lastError}>{s.fiscal.lastError}</p>
                  )}
                </td>
                <td className="py-2 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">{s.fiscal?.fiscalNumber || '-'}</td>
                <td className="py-2 px-3">
                  <div className="flex justify-end gap-1.5">
                    <button type="button" onClick={() => onView(s)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer" title={t('table.details')} aria-label={t('table.details')}>
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    {canSubmit && (
                      <button
                        type="button"
                        onClick={() => onSubmit(s)}
                        disabled={busyId === s._id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 cursor-pointer disabled:opacity-50"
                      >
                        {retry ? <RotateCw className="w-3 h-3" /> : <Send className="w-3 h-3" />}
                        {retry ? t('actions.retry') : t('actions.submit')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default FiscalInvoiceTable;
