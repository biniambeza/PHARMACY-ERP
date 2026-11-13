import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Copy, Share2, MessageSquare, Mail, Loader2 } from 'lucide-react';
import { sendReceipt, getReceiptText } from '../../api/receiptApi';

// Digital receipt: send by SMS / email, copy the text receipt, or share it (Web Share API).
// Props: { sale }
const PHONE_RE = /^\+?[\d\s\-().]{9,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

const SendReceiptPanel = ({ sale }) => {
  const { t } = useTranslation('receipt');
  const phone = sale.customerId?.phone || sale.customer?.phone || '';
  const email = sale.customerId?.email || '';
  const [channel, setChannel] = useState(phone || !email ? 'sms' : 'email');
  const [to, setTo] = useState(phone || email || '');
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState(null); // { type: 'ok'|'warn'|'error', text }
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const switchChannel = (c) => {
    setChannel(c);
    setTo(c === 'sms' ? phone : email);
    setStatus(null);
  };

  const valid = channel === 'sms' ? PHONE_RE.test(to.trim()) : EMAIL_RE.test(to.trim());

  const handleSend = async (e) => {
    e.preventDefault();
    if (!valid) {
      setStatus({ type: 'error', text: channel === 'sms' ? t('send.invalidPhone') : t('send.invalidEmail') });
      return;
    }
    setBusy('send');
    setStatus(null);
    try {
      const res = await sendReceipt(sale._id, { channel, to: to.trim() });
      setStatus(
        res.sent
          ? { type: 'ok', text: t('send.sent', { to: res.to }) }
          : { type: 'warn', text: t('send.logged') }
      );
    } catch (err) {
      const code = err.response?.status;
      setStatus({
        type: 'error',
        text: code === 429 ? t('send.rateLimited') : err.response?.data?.message || t('send.failed'),
      });
    } finally {
      setBusy('');
    }
  };

  const fetchText = async () => (await getReceiptText(sale._id)).text || '';

  const handleCopy = async () => {
    setBusy('copy');
    setStatus(null);
    try {
      const text = await fetchText();
      await navigator.clipboard.writeText(text);
      setStatus({ type: 'ok', text: t('send.copied') });
    } catch {
      setStatus({ type: 'error', text: t('send.copyFailed') });
    } finally {
      setBusy('');
    }
  };

  const handleShare = async () => {
    setBusy('share');
    setStatus(null);
    try {
      const text = await fetchText();
      await navigator.share({ title: t('send.shareTitle', { number: sale.invoiceNumber }), text });
    } catch (err) {
      if (err?.name !== 'AbortError') setStatus({ type: 'error', text: t('send.shareFailed') });
    } finally {
      setBusy('');
    }
  };

  const tab = (active) =>
    `px-3 py-1 rounded-lg text-[11px] font-semibold cursor-pointer transition flex items-center gap-1 ${
      active
        ? 'bg-white dark:bg-[#161c26] text-emerald-600 dark:text-emerald-400 shadow-2xs'
        : 'text-slate-600 dark:text-slate-400'
    }`;
  const smallBtn =
    'px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl shadow-2xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50';
  const statusCls = {
    ok: 'text-emerald-700 dark:text-emerald-400',
    warn: 'text-amber-700 dark:text-amber-400',
    error: 'text-rose-700 dark:text-rose-400',
  };

  return (
    <div className="mt-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100">{t('send.title')}</h3>
        <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
          <button type="button" className={tab(channel === 'sms')} onClick={() => switchChannel('sms')}>
            <MessageSquare className="w-3 h-3" />
            {t('send.sms')}
          </button>
          <button type="button" className={tab(channel === 'email')} onClick={() => switchChannel('email')}>
            <Mail className="w-3 h-3" />
            {t('send.email')}
          </button>
        </div>
      </div>

      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type={channel === 'sms' ? 'tel' : 'email'}
          aria-label={channel === 'sms' ? t('send.phonePlaceholder') : t('send.emailPlaceholder')}
          placeholder={channel === 'sms' ? t('send.phonePlaceholder') : t('send.emailPlaceholder')}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="flex-1 min-w-0 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        />
        <button
          type="submit"
          disabled={Boolean(busy) || !to.trim()}
          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
        >
          {busy === 'send' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {t('send.send')}
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={handleCopy} disabled={Boolean(busy)} className={smallBtn}>
          <Copy className="w-3.5 h-3.5" />
          {t('send.copy')}
        </button>
        {canShare && (
          <button type="button" onClick={handleShare} disabled={Boolean(busy)} className={smallBtn}>
            <Share2 className="w-3.5 h-3.5" />
            {t('send.share')}
          </button>
        )}
      </div>

      {status && (
        <p role="status" className={`text-[11px] ${statusCls[status.type]}`}>
          {status.text}
        </p>
      )}
    </div>
  );
};

export default SendReceiptPanel;
