import { useCallback, useEffect, useState } from 'react';
import { FileText, Send, RefreshCw, Trash2, Download, Printer, Banknote, Ban } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  getClaim, submitClaim, refreshClaim, deleteClaim, recordClaimPayment, rejectClaim, downloadClaimExcel,
} from '../../api/insuranceApi';
import { useAuth } from '../../context/useAuth';
import { formatMoney, formatDate } from '../../utils/format';
import { Modal, ErrorBox } from '../customers/CustomerModal';
import { printClaim } from './claimPrint';
import { inputCls, labelCls, btnPrimary, btnGhost, errMsg, toDateInput, claimStatusCls, pillCls, thCls, tdCls } from './insuranceUi';

// Claim details with its lifecycle actions: refresh/submit/delete (draft), payments and rejection
// (submitted), Excel export and print.
const ClaimDetailModal = ({ claimId, onClose, onChanged }) => {
  const { t } = useTranslation('insurance');
  const { activePharmacy } = useAuth();
  const [claim, setClaim] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(null); // 'pay' | 'reject'
  const [pay, setPay] = useState({ amount: '', date: toDateInput(new Date()), reference: '', note: '' });
  const [reject, setReject] = useState({ notes: '', releaseSales: true });

  const load = useCallback(async () => {
    try {
      const res = await getClaim(claimId);
      setClaim(res.claim);
    } catch (err) {
      setError(errMsg(err, t('errors.generic')));
    }
  }, [claimId, t]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const run = async (fn, { close = false } = {}) => {
    setBusy(true);
    setError('');
    try {
      const res = await fn();
      if (res?.claim) setClaim(res.claim);
      setMode(null);
      onChanged();
      if (close) onClose();
    } catch (err) {
      setError(errMsg(err, t('errors.generic')));
    } finally {
      setBusy(false);
    }
  };

  if (!claim) {
    return (
      <Modal title={t('claims.detailTitle')} icon={FileText} onClose={onClose} wide>
        <ErrorBox error={error} />
        {!error && <p className="text-xs text-slate-500">{t('loading')}</p>}
      </Modal>
    );
  }

  const open = ['submitted', 'partially_paid'].includes(claim.status);

  return (
    <Modal title={`${t('claims.detailTitle')} ${claim.claimNumber}`} subtitle={claim.scheme?.name || claim.schemeName} icon={FileText} onClose={onClose} wide>
      <ErrorBox error={error} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-4">
        <div><div className="text-slate-400">{t('fields.status')}</div><span className={`${pillCls} ${claimStatusCls[claim.status]}`}>{t(`claimStatus.${claim.status}`)}</span></div>
        <div><div className="text-slate-400">{t('fields.period')}</div><div className="font-semibold">{formatDate(claim.periodFrom)} – {formatDate(claim.periodTo)}</div></div>
        <div><div className="text-slate-400">{t('fields.total')}</div><div className="font-mono font-bold">{formatMoney(claim.totalAmount)}</div></div>
        <div><div className="text-slate-400">{t('fields.outstanding')}</div><div className="font-mono font-bold text-amber-600">{formatMoney(claim.outstanding)}</div></div>
      </div>
      {claim.status === 'rejected' && (
        <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-700 dark:text-rose-300">
          <b>{t('claims.rejectedOn', { date: formatDate(claim.rejectedAt) })}</b> {claim.rejectionNotes}
          <div className="mt-1 text-[11px]">{claim.salesReleased ? t('claims.salesReleased') : t('claims.salesWrittenOff')}</div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {claim.status === 'draft' && (
          <>
            <button disabled={busy} onClick={() => run(() => submitClaim(claim._id))} className={btnPrimary}><Send className="w-4 h-4" /> {t('claims.submit')}</button>
            <button disabled={busy} onClick={() => run(() => refreshClaim(claim._id))} className={btnGhost}><RefreshCw className="w-3.5 h-3.5 inline mr-1" />{t('claims.refresh')}</button>
            <button
              disabled={busy}
              onClick={() => window.confirm(t('claims.confirmDelete')) && run(() => deleteClaim(claim._id), { close: true })}
              className={`${btnGhost} text-rose-600`}
            >
              <Trash2 className="w-3.5 h-3.5 inline mr-1" />{t('claims.delete')}
            </button>
          </>
        )}
        {open && (
          <>
            <button disabled={busy} onClick={() => { setMode('pay'); setPay((p) => ({ ...p, amount: String(claim.outstanding) })); }} className={btnPrimary}><Banknote className="w-4 h-4" /> {t('claims.recordPayment')}</button>
            <button disabled={busy} onClick={() => setMode('reject')} className={`${btnGhost} text-rose-600`}><Ban className="w-3.5 h-3.5 inline mr-1" />{t('claims.reject')}</button>
          </>
        )}
        <button onClick={() => downloadClaimExcel(claim).catch((err) => setError(errMsg(err, t('errors.generic'))))} className={btnGhost}><Download className="w-3.5 h-3.5 inline mr-1" />{t('claims.exportExcel')}</button>
        <button onClick={() => printClaim({ claim, pharmacy: activePharmacy, t })} className={btnGhost}><Printer className="w-3.5 h-3.5 inline mr-1" />{t('claims.print')}</button>
      </div>

      {mode === 'pay' && (
        <form
          onSubmit={(e) => { e.preventDefault(); run(() => recordClaimPayment(claim._id, { ...pay, amount: Number(pay.amount) })); }}
          className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3 mb-4 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20"
        >
          <div><label className={labelCls}>{t('fields.amount')}</label><input type="number" min="0.01" step="0.01" required className={`${inputCls} font-mono`} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></div>
          <div><label className={labelCls}>{t('fields.date')}</label><input type="date" className={inputCls} value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></div>
          <div><label className={labelCls}>{t('fields.reference')}</label><input className={inputCls} value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></div>
          <div className="flex items-end gap-2">
            <button type="submit" disabled={busy} className={btnPrimary}>{t('save')}</button>
            <button type="button" onClick={() => setMode(null)} className={btnGhost}>{t('common:buttons.cancel')}</button>
          </div>
        </form>
      )}
      {mode === 'reject' && (
        <form
          onSubmit={(e) => { e.preventDefault(); run(() => rejectClaim(claim._id, reject)); }}
          className="space-y-2 p-3 mb-4 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20"
        >
          <label className={labelCls}>{t('claims.rejectionNotes')}</label>
          <textarea rows={2} required className={inputCls} value={reject.notes} onChange={(e) => setReject({ ...reject, notes: e.target.value })} />
          {claim.paidAmount > 0 ? (
            <p className="text-[11px] text-slate-500">{t('claims.rejectPaidHint')}</p>
          ) : (
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={reject.releaseSales} onChange={(e) => setReject({ ...reject, releaseSales: e.target.checked })} /> {t('claims.releaseSales')}
            </label>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={`${btnPrimary} bg-rose-600 hover:bg-rose-500`}>{t('claims.reject')}</button>
            <button type="button" onClick={() => setMode(null)} className={btnGhost}>{t('common:buttons.cancel')}</button>
          </div>
        </form>
      )}

      <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800">
          <thead>
            <tr>
              <th className={thCls}>{t('fields.date')}</th>
              <th className={thCls}>{t('fields.invoice')}</th>
              <th className={thCls}>{t('fields.member')}</th>
              <th className={`${thCls} text-right`}>{t('fields.saleTotal')}</th>
              <th className={`${thCls} text-right`}>{t('fields.insurerShare')}</th>
              <th className={`${thCls} text-right`}>{t('fields.returned')}</th>
              <th className={`${thCls} text-right`}>{t('fields.claimed')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {claim.sales.map((l) => (
              <tr key={l.saleId}>
                <td className={tdCls}>{formatDate(l.saleDate)}</td>
                <td className={`${tdCls} font-mono`}>{l.invoiceNumber}</td>
                <td className={tdCls}>{l.memberNo} · {l.memberName}</td>
                <td className={`${tdCls} text-right font-mono`}>{formatMoney(l.saleTotal)}</td>
                <td className={`${tdCls} text-right font-mono`}>{formatMoney(l.insurerAmount)}</td>
                <td className={`${tdCls} text-right font-mono`}>{l.returnedAmount > 0 ? `-${formatMoney(l.returnedAmount)}` : '-'}</td>
                <td className={`${tdCls} text-right font-mono font-semibold`}>{formatMoney(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {claim.payments?.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">{t('claims.payments')}</h3>
          <ul className="space-y-1 text-xs">
            {claim.payments.map((p) => (
              <li key={p._id} className="flex justify-between border-b border-slate-100 dark:border-slate-800 py-1">
                <span>{formatDate(p.date)} {p.reference && <span className="font-mono text-slate-500">· {p.reference}</span>}</span>
                <span className="font-mono font-semibold text-emerald-600">{formatMoney(p.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
};

export default ClaimDetailModal;
