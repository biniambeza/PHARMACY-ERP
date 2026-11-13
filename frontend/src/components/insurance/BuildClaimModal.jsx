import { useEffect, useId, useState } from 'react';
import { FileStack, CheckCircle, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getUnclaimed, createClaim } from '../../api/insuranceApi';
import { formatMoney, formatDate } from '../../utils/format';
import { Modal, ErrorBox } from '../customers/CustomerModal';
import EthiopianDateHint from '../common/EthiopianDateHint';
import { inputCls, labelCls, btnPrimary, btnGhost, errMsg, toDateInput, firstOfMonth, thCls, tdCls } from './insuranceUi';

// Builds a claim from the unclaimed insurance sales of a scheme in a period.
const BuildClaimModal = ({ schemes, onClose, onCreated }) => {
  const { t } = useTranslation('insurance');
  const uid = useId();
  const fromId = `${uid}-from`;
  const toId = `${uid}-to`;
  const [form, setForm] = useState(() => ({
    schemeId: schemes.find((s) => s.active)?._id || schemes[0]?._id || '',
    from: firstOfMonth(),
    to: toDateInput(new Date()),
    notes: '',
  }));
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!form.schemeId || !form.from || !form.to) return;
      try {
        const res = await getUnclaimed({ schemeId: form.schemeId, from: form.from, to: form.to });
        if (!cancelled) {
          setPreview(res);
          setError('');
        }
      } catch (err) {
        if (!cancelled) {
          setPreview(null);
          setError(errMsg(err, t('errors.generic')));
        }
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.schemeId, form.from, form.to, t]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await createClaim(form);
      onCreated(res.claim);
    } catch (err) {
      setError(errMsg(err, t('claims.errors.buildFailed')));
    } finally {
      setBusy(false);
    }
  };

  const sales = preview?.sales || [];

  return (
    <Modal title={t('claims.buildTitle')} subtitle={t('claims.buildSubtitle')} icon={FileStack} onClose={onClose} wide>
      <ErrorBox error={error} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>{t('fields.scheme')}</label>
            <select className={`${inputCls} cursor-pointer`} value={form.schemeId} onChange={set('schemeId')}>
              {schemes.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={fromId} className={labelCls}>{t('fields.from')}</label>
            <input id={fromId} type="date" className={inputCls} value={form.from} onChange={set('from')} aria-describedby={`${fromId}-eth`} />
            <EthiopianDateHint value={form.from} id={`${fromId}-eth`} />
          </div>
          <div>
            <label htmlFor={toId} className={labelCls}>{t('fields.to')}</label>
            <input id={toId} type="date" className={inputCls} value={form.to} onChange={set('to')} aria-describedby={`${toId}-eth`} />
            <EthiopianDateHint value={form.to} id={`${toId}-eth`} />
          </div>
        </div>

        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="flex justify-between items-center px-4 py-2 bg-slate-50 dark:bg-slate-800/40 text-xs">
            <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-semibold">
              <Search className="w-3.5 h-3.5" /> {t('claims.unclaimedCount', { count: sales.length })}
            </span>
            <span className="font-mono font-bold text-emerald-600">{formatMoney(preview?.total || 0)}</span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800">
              <thead>
                <tr>
                  <th className={thCls}>{t('fields.date')}</th>
                  <th className={thCls}>{t('fields.invoice')}</th>
                  <th className={thCls}>{t('fields.member')}</th>
                  <th className={`${thCls} text-right`}>{t('fields.insurerShare')}</th>
                  <th className={`${thCls} text-right`}>{t('fields.returned')}</th>
                  <th className={`${thCls} text-right`}>{t('fields.claimed')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sales.length === 0 ? (
                  <tr><td colSpan={6} className={`${tdCls} text-center py-6 text-slate-400`}>{t('claims.nothingToClaim')}</td></tr>
                ) : (
                  sales.map((s) => (
                    <tr key={s.saleId}>
                      <td className={tdCls}>{formatDate(s.saleDate)}</td>
                      <td className={`${tdCls} font-mono`}>{s.invoiceNumber}</td>
                      <td className={tdCls}>{s.memberNo} · {s.memberName}</td>
                      <td className={`${tdCls} text-right font-mono`}>{formatMoney(s.insurerAmount)}</td>
                      <td className={`${tdCls} text-right font-mono`}>{s.returnedAmount > 0 ? `-${formatMoney(s.returnedAmount)}` : '-'}</td>
                      <td className={`${tdCls} text-right font-mono font-semibold`}>{formatMoney(s.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <label className={labelCls}>{t('fields.notes')}</label>
          <textarea rows={2} className={inputCls} value={form.notes} onChange={set('notes')} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnGhost}>{t('common:buttons.cancel')}</button>
          <button type="submit" disabled={busy || sales.length === 0} className={btnPrimary}>
            <CheckCircle className="w-4 h-4" /> {t('claims.build')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default BuildClaimModal;
