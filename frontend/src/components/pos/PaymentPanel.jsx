import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Loader2, CheckCircle2, XCircle, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createPaymentIntent, getPaymentIntent } from '../../api/paymentApi';
import { formatMoney } from '../../utils/format';
import { inputCls, round2, errMsg, newPaymentRow } from './posUtils';
import InsurancePaymentFields from './InsurancePaymentFields';

// Mobile money row: manual reference, or a push request that waits for confirmation (#26).
const MobileMoneyFields = ({ row, providers, defaultProvider, onPatch }) => {
  const { t } = useTranslation('pos');
  const provider = row.provider || defaultProvider || 'manual';
  const meta = providers.find((p) => p.name === provider);
  const push = meta && meta.flow === 'push';
  const [busy, setBusy] = useState(false);
  const patchRef = useRef(onPatch);
  useEffect(() => {
    patchRef.current = onPatch;
  }, [onPatch]);

  // Poll a pending intent until the provider webhook confirms or fails it
  useEffect(() => {
    if (!row.intentId || row.intentStatus !== 'pending') return undefined;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const { intent } = await getPaymentIntent(row.intentId);
        if (!cancelled && intent.status !== 'pending') {
          patchRef.current({ intentStatus: intent.status, reference: intent.reference || '', error: intent.failureReason || '' });
        }
      } catch {
        // keep polling
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [row.intentId, row.intentStatus]);

  const request = async () => {
    setBusy(true);
    onPatch({ error: '' });
    try {
      const { intent } = await createPaymentIntent({ amount: Number(row.amount), provider, phone: row.phone });
      onPatch({ intentId: intent._id, intentStatus: intent.status, reference: intent.reference || '', provider });
    } catch (err) {
      onPatch({ error: errMsg(err, t('payment.requestFailed')) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="col-span-full grid grid-cols-2 gap-1.5">
      {providers.length > 1 && (
        <select
          value={provider}
          disabled={Boolean(row.intentId)}
          onChange={(e) => onPatch({ provider: e.target.value, intentId: null, intentStatus: null, reference: '' })}
          className={`${inputCls} cursor-pointer`}
        >
          {providers.map((p) => (
            <option key={p.name} value={p.name} disabled={!p.configured}>
              {p.label}{p.configured ? '' : t('payment.notConfigured')}
            </option>
          ))}
        </select>
      )}
      {push ? (
        <>
          <input
            value={row.phone}
            disabled={Boolean(row.intentId)}
            onChange={(e) => onPatch({ phone: e.target.value })}
            placeholder={t('payment.customerPhone')}
            className={`${inputCls} font-mono`}
          />
          <div className="col-span-2 flex items-center gap-2 text-[11px]">
            {!row.intentId || row.intentStatus === 'failed' || row.intentStatus === 'cancelled' ? (
              <button
                type="button"
                disabled={busy || !(Number(row.amount) > 0) || !row.phone}
                onClick={request}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold disabled:opacity-50 cursor-pointer"
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} {t('payment.request')}
              </button>
            ) : null}
            {row.intentStatus === 'pending' && (
              <span className="inline-flex items-center gap-1 text-amber-600"><Loader2 className="w-3 h-3 animate-spin" /> {t('payment.waiting')}</span>
            )}
            {row.intentStatus === 'confirmed' && (
              <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3 h-3" /> {t('payment.confirmed', { reference: row.reference })}</span>
            )}
            {(row.intentStatus === 'failed' || row.intentStatus === 'cancelled') && (
              <span className="inline-flex items-center gap-1 text-rose-600"><XCircle className="w-3 h-3" /> {row.intentStatus === 'failed' ? t('payment.intentFailed') : t('payment.intentCancelled')}</span>
            )}
          </div>
        </>
      ) : (
        <input
          value={row.reference}
          onChange={(e) => onPatch({ reference: e.target.value, provider: 'manual' })}
          placeholder={t('payment.mobileRef')}
          className={`${inputCls} font-mono ${providers.length > 1 ? '' : 'col-span-2'}`}
        />
      )}
      {row.error && <p className="col-span-2 text-[11px] text-rose-600">{row.error}</p>}
    </div>
  );
};

/**
 * Discount, totals and split payments with change (#6, #22, #26).
 * Props:
 *   totals: computeTotals() result
 *   discount, onDiscount(value)
 *   payments: rows (see newPaymentRow), onPayments(rows)
 *   status: paymentStatus() result
 *   allowedMethods: string[]
 *   providers, defaultProvider
 *   insuranceLines: [{ medicineId, amount }] for the insurance coverage preview
 */
const PaymentPanel = ({
  totals, discount, onDiscount, payments, onPayments, status, allowedMethods, providers, defaultProvider, insuranceLines = [],
}) => {
  const { t } = useTranslation('pos');
  const patch = (id, changes) => onPayments((rows) => rows.map((r) => (r.id === id ? { ...r, ...changes } : r)));
  const remove = (id) => onPayments((rows) => rows.filter((r) => r.id !== id));
  const add = () => {
    const method = allowedMethods.find((m) => !payments.some((p) => p.method === m)) || 'cash';
    onPayments((rows) => [...rows, newPaymentRow(method, status.remaining > 0 ? round2(status.remaining) : '')]);
  };
  const exact = (id) => {
    const others = payments.filter((p) => p.id !== id).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    patch(id, { amount: String(round2(Math.max(0, totals.grandTotal - others))) });
  };
  const cashQuick = [...new Set([50, 100, 200, 500, 1000].map((n) => Math.ceil(totals.grandTotal / n) * n))]
    .filter((v) => v > totals.grandTotal)
    .slice(0, 3);
  const cashRow = payments.find((p) => p.method === 'cash');

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block mb-1">
            {totals.maxDiscount.pct < 100 ? t('payment.discountMax', { pct: totals.maxDiscount.pct }) : t('payment.discount')}
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={discount}
            onChange={(e) => onDiscount(e.target.value)}
            placeholder="0.00"
            className={`${inputCls} font-mono`}
          />
          {Number(discount) > totals.discount + 0.005 && (
            <p className="text-[10px] text-amber-600 mt-0.5">{t('payment.capped', { amount: formatMoney(totals.discount) })}</p>
          )}
        </div>
        <div className="bg-slate-50/90 dark:bg-slate-900/80 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 text-[11px] space-y-0.5">
          <div className="flex justify-between text-slate-500"><span>{t('payment.subtotal')}</span><span className="font-mono">{formatMoney(totals.subtotal)}</span></div>
          {totals.discount > 0 && (
            <div className="flex justify-between text-emerald-600"><span>{t('payment.discount')}</span><span className="font-mono">-{formatMoney(totals.discount)}</span></div>
          )}
          {totals.taxEnabled && (
            <div className="flex justify-between text-slate-500">
              <span>{totals.taxName} {totals.taxRate}%{totals.inclusive ? t('payment.taxIncl') : ''}</span>
              <span className="font-mono">{totals.inclusive ? '' : '+'}{formatMoney(totals.tax)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center px-1">
        <span className="text-sm font-bold text-slate-900 dark:text-white">{t('payment.total')}</span>
        <span className="text-xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400">{formatMoney(totals.grandTotal)}</span>
      </div>

      <div className="space-y-2">
        {payments.map((row) => (
          <div key={row.id} className="grid grid-cols-[1fr_1fr_auto_auto] gap-1.5 items-center">
            <select
              value={row.method}
              onChange={(e) =>
                patch(row.id, {
                  method: e.target.value,
                  reference: '',
                  intentId: null,
                  intentStatus: null,
                  error: '',
                  schemeId: '',
                  member: null,
                  preview: null,
                  ...(e.target.value === 'insurance' || row.method === 'insurance' ? { amount: '' } : {}),
                })
              }
              className={`${inputCls} cursor-pointer`}
            >
              {allowedMethods
                .filter((m) => m !== 'insurance' || row.method === 'insurance' || !payments.some((p) => p.method === 'insurance'))
                .map((m) => (
                  <option key={m} value={m}>{t(`methods.${m}`)}</option>
                ))}
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              value={row.amount}
              disabled={row.method === 'insurance' || (row.method === 'mobile_money' && Boolean(row.intentId) && row.intentStatus !== 'failed')}
              onChange={(e) => patch(row.id, { amount: e.target.value })}
              placeholder="0.00"
              className={`${inputCls} font-mono`}
              data-pos-payment-amount="true"
            />
            <button type="button" onClick={() => exact(row.id)} disabled={row.method === 'insurance'} className="text-[10px] font-semibold px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer" title={t('payment.exactTitle')}>
              {t('payment.exact')}
            </button>
            <button type="button" onClick={() => remove(row.id)} disabled={payments.length <= 1} aria-label={t('payment.removeRow')} className="p-1 text-slate-400 hover:text-rose-500 disabled:opacity-30 cursor-pointer">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            {row.method === 'card' && (
              <input
                value={row.reference}
                onChange={(e) => patch(row.id, { reference: e.target.value })}
                placeholder={t('payment.cardRef')}
                className={`${inputCls} col-span-full font-mono`}
              />
            )}
            {row.method === 'insurance' && (
              <InsurancePaymentFields row={row} lines={insuranceLines} onPatch={(changes) => patch(row.id, changes)} />
            )}
            {row.method === 'mobile_money' && (
              <MobileMoneyFields
                row={row}
                providers={providers}
                defaultProvider={defaultProvider}
                onPatch={(changes) => patch(row.id, changes)}
              />
            )}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={add} className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-500 cursor-pointer">
            <Plus className="w-3 h-3" /> {t('payment.split')}
          </button>
          {cashRow &&
            cashQuick.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => patch(cashRow.id, { amount: String(v) })}
                className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 cursor-pointer"
              >
                {v}
              </button>
            ))}
        </div>
      </div>

      <div className="flex justify-between text-xs px-1">
        {status.remaining > 0.005 ? (
          <span className="text-rose-600 font-semibold">{t('payment.remaining', { amount: formatMoney(status.remaining) })}</span>
        ) : status.invalidExcess ? (
          <span className="text-rose-600 font-semibold">{t('payment.onlyCashExcess')}</span>
        ) : (
          <span className="text-emerald-600 font-semibold">{t('payment.paidInFull')}</span>
        )}
        {status.change > 0 && <span className="font-bold text-slate-900 dark:text-white">{t('payment.change', { amount: formatMoney(status.change) })}</span>}
      </div>
    </div>
  );
};

export default PaymentPanel;
