import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileCheck2, FileMinus2, AlertCircle } from 'lucide-react';
import { getFiscalInvoice, issueCreditNote } from '../../api/einvoiceApi';
import { formatMoney, formatDateTime } from '../../utils/format';
import PosModal, { secondaryBtn } from '../pos/PosModal';
import { errMsg } from '../pos/posUtils';
import FiscalStatusBadge from './FiscalStatusBadge';

const Field = ({ label, children }) => (
  <div>
    <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
    <dd className="text-xs text-slate-800 dark:text-slate-100 break-all">{children || '-'}</dd>
  </div>
);

/** Fiscal record of a sale: identifiers, payload lines, credit notes for its returns. */
const FiscalInvoiceDetailModal = ({ saleId, enabled, onClose, onChanged }) => {
  const { t } = useTranslation('einvoice');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await getFiscalInvoice(saleId));
    } catch (err) {
      setError(errMsg(err, t('detail.loadFailed')));
    }
  }, [saleId, t]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const creditNote = async (returnId) => {
    setBusy(returnId);
    setError('');
    try {
      await issueCreditNote(returnId);
    } catch (err) {
      setError(errMsg(err, t('detail.creditNoteFailed')));
    } finally {
      setBusy('');
      await load();
      onChanged?.();
    }
  };

  const inv = data?.invoice;
  const payload = inv?.payload;
  const notesByReturn = new Map((data?.creditNotes || []).map((cn) => [String(cn.returnId), cn]));
  const isMock = inv?.provider === 'mock';

  return (
    <PosModal open title={t('detail.title', { number: data?.sale?.invoiceNumber || '' })} icon={FileCheck2} onClose={onClose} wide
      footer={<button type="button" className={secondaryBtn} onClick={onClose}>{t('common:buttons.close')}</button>}
    >
      {error && (
        <div className="mb-3 flex items-center gap-2 text-xs text-rose-600"><AlertCircle className="w-4 h-4" />{error}</div>
      )}
      {!data ? (
        !error && <p className="text-xs text-slate-400">{t('common:labels.loading')}</p>
      ) : (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label={t('table.status')}><FiscalStatusBadge status={inv?.status || 'unsubmitted'} /></Field>
            <Field label={t('detail.provider')}>{inv ? t(`providers.${inv.provider}`) : ''}</Field>
            <Field label={t('detail.attempts')}>{inv?.attempts ?? 0}</Field>
            <Field label={t('table.fiscalNumber')}>{inv?.fiscalNumber}</Field>
            <Field label={t('detail.irn')}>{inv?.irn}</Field>
            <Field label={t('detail.acceptedAt')}>{inv?.acceptedAt ? formatDateTime(inv.acceptedAt) : ''}</Field>
          </dl>
          {isMock && <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-300">{t('detail.mockWarning')}</p>}
          {inv?.lastError && <p className="text-xs text-rose-600">{inv.lastError}</p>}
          {inv?.qrPayload && (
            <Field label={t('detail.qr')}><code className="text-[10px]">{inv.qrPayload}</code></Field>
          )}

          {payload?.lines?.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">{t('detail.lines')}</h4>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-slate-500">
                    <th className="text-left font-semibold py-1">{t('detail.item')}</th>
                    <th className="text-right font-semibold py-1">{t('detail.qty')}</th>
                    <th className="text-right font-semibold py-1">{t('detail.taxable')}</th>
                    <th className="text-right font-semibold py-1">{t('detail.taxRate')}</th>
                    <th className="text-right font-semibold py-1">{t('table.tax')}</th>
                    <th className="text-right font-semibold py-1">{t('table.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.lines.map((l) => (
                    <tr key={l.lineNo} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="py-1">{l.description}</td>
                      <td className="py-1 text-right">{l.quantity}</td>
                      <td className="py-1 text-right font-mono">{formatMoney(l.taxableAmount)}</td>
                      <td className="py-1 text-right">{l.taxRate}%</td>
                      <td className="py-1 text-right font-mono">{formatMoney(l.taxAmount)}</td>
                      <td className="py-1 text-right font-mono">{formatMoney(l.lineTotal)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200 dark:border-slate-700 font-semibold">
                    <td className="py-1" colSpan={4}>{t('detail.totals')}</td>
                    <td className="py-1 text-right font-mono">{formatMoney(payload.totals?.taxTotal)}</td>
                    <td className="py-1 text-right font-mono">{formatMoney(payload.totals?.grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {data.returns?.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">{t('detail.creditNotes')}</h4>
              <ul className="space-y-1.5">
                {data.returns.map((r) => {
                  const cn = notesByReturn.get(String(r._id));
                  const canIssue = enabled && inv && ['accepted', 'submitted', 'not_required'].includes(inv.status)
                    && (!cn || ['pending', 'failed', 'rejected'].includes(cn.status));
                  return (
                    <li key={r._id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-mono">{r.returnNumber} - {formatMoney(r.refundTotal)}</span>
                      <span className="flex items-center gap-2">
                        {cn ? <FiscalStatusBadge status={cn.status} /> : <FiscalStatusBadge status="unsubmitted" />}
                        {cn?.fiscalNumber && <span className="font-mono text-[10px]">{cn.fiscalNumber}</span>}
                        {canIssue && (
                          <button type="button" className={secondaryBtn} disabled={busy === r._id} onClick={() => creditNote(r._id)}>
                            <FileMinus2 className="w-3.5 h-3.5" /> {t('actions.creditNote')}
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </PosModal>
  );
};

export default FiscalInvoiceDetailModal;
