import { Printer, X, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatMoney, formatDateTime } from '../../utils/format';

const METHODS = ['cash', 'card', 'mobile_money', 'credit', 'store_credit'];

// Only the credit note is visible when printing.
const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  .credit-note-print, .credit-note-print * { visibility: visible !important; color: #000 !important; }
  .credit-note-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important;
    background: #fff !important; border: none !important; box-shadow: none !important; }
}
`;

const CreditNote = ({ ret, pharmacyName, onClose }) => {
  const { t } = useTranslation('returns');
  if (!ret) return null;
  const invoice = ret.invoiceNumber || ret.saleId?.invoiceNumber || '';
  const refundDue =
    typeof ret.refundDue === 'number' && (ret.refundDue > 0 || ret.creditReversed > 0)
      ? ret.refundDue
      : Math.max(0, (ret.refundTotal || 0) - (ret.creditReversed || 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs">
      <style>{PRINT_CSS}</style>
      <div className="bg-white dark:bg-[#161c26] border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-200/80 dark:border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">{t('creditNote.title')}</h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{t('common:buttons.print')}</span>
            </button>
            <button
              onClick={onClose}
              aria-label={t('common:buttons.close')}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="credit-note-print bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/60 rounded-xl p-5 text-xs text-slate-800 dark:text-slate-200">
          <div className="text-center pb-3 border-b border-dashed border-slate-300 dark:border-slate-700">
            <div className="font-extrabold text-base text-slate-900 dark:text-white">{pharmacyName || t('creditNote.pharmacy')}</div>
            <div className="font-bold tracking-wider uppercase mt-1">{t('creditNote.heading')}</div>
          </div>

          <div className="py-3 border-b border-dashed border-slate-300 dark:border-slate-700 space-y-1">
            <Row label={t('creditNote.number')} value={<span className="font-mono font-bold">{ret.returnNumber}</span>} />
            <Row label={t('creditNote.originalInvoice')} value={<span className="font-mono">{invoice}</span>} />
            <Row label={t('common:labels.date')} value={formatDateTime(ret.createdAt)} />
            {ret.customer?.name && <Row label={t('creditNote.customer')} value={ret.customer.name} />}
            <Row label={t('table.processedBy')} value={ret.processedBy?.name || '-'} />
            <Row label={t('table.reason')} value={ret.reason} />
          </div>

          <table className="w-full my-3">
            <thead>
              <tr className="text-[10px] uppercase text-slate-500 dark:text-slate-400">
                <th className="text-left py-1">{t('creditNote.item')}</th>
                <th className="text-right py-1">{t('creditNote.qty')}</th>
                <th className="text-right py-1">{t('table.refund')}</th>
              </tr>
            </thead>
            <tbody>
              {ret.items.map((it) => (
                <tr key={it._id}>
                  <td className="py-1">
                    {it.name}
                    <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                      {t('creditNote.batch', { batch: it.batchNo })} · {it.restocked ? t('creditNote.restocked') : t('creditNote.notRestocked')}
                    </span>
                  </td>
                  <td className="py-1 text-right font-mono">{it.quantity}</td>
                  <td className="py-1 text-right font-mono">{formatMoney(it.refundAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="pt-3 border-t border-dashed border-slate-300 dark:border-slate-700 space-y-1">
            <Row
              label={t('creditNote.totalRefund')}
              value={<span className="font-bold font-mono text-sm">{formatMoney(ret.refundTotal)}</span>}
            />
            {ret.creditReversed > 0 && (
              <Row label={t('creditNote.creditReversed')} value={<span className="font-mono">{formatMoney(ret.creditReversed)}</span>} />
            )}
            {refundDue > 0 && (
              <Row
                label={t('creditNote.refundedVia', {
                  method: METHODS.includes(ret.refundMethod) ? t(`methods.${ret.refundMethod}`) : ret.refundMethod,
                })}
                value={<span className="font-mono">{formatMoney(refundDue)}</span>}
              />
            )}
          </div>

          <p className="text-center text-[10px] text-slate-500 dark:text-slate-400 mt-4">
            {t('creditNote.signature')} ____________________
          </p>
        </div>
      </div>
    </div>
  );
};

const Row = ({ label, value }) => (
  <div className="flex justify-between gap-3">
    <span className="text-slate-500 dark:text-slate-400">{label}:</span>
    <span className="text-right">{value}</span>
  </div>
);

export default CreditNote;
