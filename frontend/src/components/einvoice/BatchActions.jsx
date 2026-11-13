import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, RotateCw } from 'lucide-react';
import { retryFailedInvoices, submitPendingInvoices } from '../../api/einvoiceApi';
import { primaryBtn, secondaryBtn } from '../pos/PosModal';
import { cardCls, inputCls, labelCls, errMsg } from '../pos/posUtils';
import EthiopianDateHint from '../common/EthiopianDateHint';

const today = () => new Date().toISOString().slice(0, 10);

/** Owner-only batch tools: submit pending sales in a date range, retry failed submissions. */
const BatchActions = ({ enabled, onDone }) => {
  const { t } = useTranslation('einvoice');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState('');
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  const run = async (kind) => {
    setBusy(kind);
    setError('');
    setSummary(null);
    try {
      const res = kind === 'pending' ? await submitPendingInvoices({ from, to }) : await retryFailedInvoices();
      setSummary(res.summary);
      onDone?.();
    } catch (err) {
      setError(errMsg(err, t('batch.failed')));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className={`${cardCls} p-5 space-y-3`}>
      <h2 className="text-sm font-bold text-slate-900 dark:text-white">{t('batch.title')}</h2>
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative">
          <label className="block space-y-1">
            <span className={labelCls}>{t('filters.from')}</span>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inputCls} aria-describedby="einvoice-batch-from-eth" />
          </label>
          <EthiopianDateHint value={from} id="einvoice-batch-from-eth" className="absolute left-0 top-full whitespace-nowrap" />
        </div>
        <div className="relative">
          <label className="block space-y-1">
            <span className={labelCls}>{t('filters.to')}</span>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputCls} aria-describedby="einvoice-batch-to-eth" />
          </label>
          <EthiopianDateHint value={to} id="einvoice-batch-to-eth" className="absolute left-0 top-full whitespace-nowrap" />
        </div>
        <button type="button" className={primaryBtn} disabled={!enabled || Boolean(busy) || !from || !to} onClick={() => run('pending')}>
          <Layers className="w-3.5 h-3.5" /> {busy === 'pending' ? t('batch.running') : t('batch.submitPending')}
        </button>
        <button type="button" className={secondaryBtn} disabled={!enabled || Boolean(busy)} onClick={() => run('failed')}>
          <RotateCw className={`w-3.5 h-3.5 ${busy === 'failed' ? 'animate-spin' : ''}`} /> {t('batch.retryFailed')}
        </button>
      </div>
      {!enabled && <p className="text-[11px] text-slate-500">{t('batch.disabledHint')}</p>}
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {summary && (
        <p className="text-xs text-slate-600 dark:text-slate-300">
          {t('batch.summary', {
            processed: summary.processed,
            accepted: summary.accepted,
            submitted: summary.submitted,
            rejected: summary.rejected,
            failed: summary.failed,
            notRequired: summary.not_required,
          })}
        </p>
      )}
    </div>
  );
};

export default BatchActions;
