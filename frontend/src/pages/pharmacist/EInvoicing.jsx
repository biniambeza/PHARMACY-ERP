import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ChevronLeft, ChevronRight, RotateCw, Search } from 'lucide-react';
import { getEInvoiceSettings, getFiscalInvoices, submitFiscalInvoice } from '../../api/einvoiceApi';
import { useAuth } from '../../context/useAuth';
import EInvoiceSettingsPanel from '../../components/einvoice/EInvoiceSettingsPanel';
import FiscalInvoiceTable from '../../components/einvoice/FiscalInvoiceTable';
import FiscalInvoiceDetailModal from '../../components/einvoice/FiscalInvoiceDetailModal';
import BatchActions from '../../components/einvoice/BatchActions';
import { secondaryBtn } from '../../components/pos/PosModal';
import { cardCls, inputCls, errMsg } from '../../components/pos/posUtils';
import EthiopianDateHint from '../../components/common/EthiopianDateHint';

const LIMIT = 20;
const STATUSES = ['', 'unsubmitted', 'pending', 'submitted', 'accepted', 'rejected', 'failed', 'not_required'];

const EInvoicing = () => {
  const { t } = useTranslation('einvoice');
  const { can } = useAuth();
  const canManage = can('einvoice:manage');

  const [settings, setSettings] = useState(null);
  const [sales, setSales] = useState([]);
  const [counts, setCounts] = useState({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const [detailId, setDetailId] = useState(null);

  const loadSettings = useCallback(async () => {
    try {
      const res = await getEInvoiceSettings();
      setSettings(res.settings);
    } catch (err) {
      setError(errMsg(err, t('errors.load')));
    }
  }, [t]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: LIMIT };
      if (status) params.status = status;
      if (from) params.from = from;
      if (to) params.to = to;
      if (query) params.search = query;
      const res = await getFiscalInvoices(params);
      setSales(res.sales || []);
      setTotal(res.total || 0);
      setCounts(res.counts || {});
    } catch (err) {
      setError(errMsg(err, t('errors.load')));
    } finally {
      setLoading(false);
    }
  }, [page, status, from, to, query, t]);

  useEffect(() => {
    const timer = setTimeout(loadSettings, 0);
    return () => clearTimeout(timer);
  }, [loadSettings]);

  useEffect(() => {
    const timer = setTimeout(loadList, 0);
    return () => clearTimeout(timer);
  }, [loadList]);

  const submit = async (sale) => {
    setBusyId(sale._id);
    setNotice('');
    setError('');
    try {
      const res = await submitFiscalInvoice(sale._id);
      setNotice(t('notices.submitted', { number: sale.invoiceNumber, status: t(`status.${res.invoice?.status}`) }));
    } catch (err) {
      setError(errMsg(err, t('errors.submit')));
    } finally {
      setBusyId('');
      loadList();
    }
  };

  const changeFilter = (setter) => (e) => {
    setter(e.target.value);
    setPage(1);
  };

  const enabled = Boolean(settings?.enabled);
  const pages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 uppercase tracking-wider">
            {t('page.badge')}
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">{t('page.title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('page.subtitle')}</p>
        </div>
        <button type="button" onClick={() => { loadSettings(); loadList(); }} className={secondaryBtn}>
          <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> {t('common:buttons.refresh')}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-2xl flex items-center gap-2.5 text-xs text-rose-700 dark:text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && !error && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-2xl text-xs text-emerald-700 dark:text-emerald-300">
          {notice}
        </div>
      )}

      {settings && <EInvoiceSettingsPanel settings={settings} canManage={canManage} onSaved={(s) => { setSettings(s); loadList(); }} />}
      {settings && !enabled && <p className="text-xs text-slate-500">{t('page.disabledHint')}</p>}

      {canManage && <BatchActions enabled={enabled} onDone={loadList} />}

      <div className={`${cardCls} p-5 space-y-4`}>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s || 'all'}
              type="button"
              onClick={() => { setStatus(s); setPage(1); }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border cursor-pointer ${
                status === s
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
            >
              {s ? t(`status.${s}`) : t('filters.all')}
              {s && counts[s] ? ` (${counts[s]})` : ''}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form
            className="relative"
            onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); setPage(1); }}
          >
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('filters.search')} className={`${inputCls} pl-8 w-56`} />
          </form>
          <div className="relative">
            <input type="date" value={from} onChange={changeFilter(setFrom)} aria-label={t('filters.from')} aria-describedby="einvoice-from-eth" className={`${inputCls} w-40`} />
            <EthiopianDateHint value={from} id="einvoice-from-eth" className="absolute left-0 top-full whitespace-nowrap" />
          </div>
          <div className="relative">
            <input type="date" value={to} onChange={changeFilter(setTo)} aria-label={t('filters.to')} aria-describedby="einvoice-to-eth" className={`${inputCls} w-40`} />
            <EthiopianDateHint value={to} id="einvoice-to-eth" className="absolute left-0 top-full whitespace-nowrap" />
          </div>
        </div>

        <FiscalInvoiceTable
          sales={sales}
          loading={loading}
          busyId={busyId}
          enabled={enabled}
          onSubmit={submit}
          onView={(s) => setDetailId(s._id)}
        />

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{t('table.count', { count: total })}</span>
          <div className="flex items-center gap-2">
            <button type="button" className={secondaryBtn} disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label={t('common:buttons.previous')}>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span>{page} / {pages}</span>
            <button type="button" className={secondaryBtn} disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label={t('common:buttons.next')}>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {detailId && (
        <FiscalInvoiceDetailModal saleId={detailId} enabled={enabled} onClose={() => setDetailId(null)} onChanged={loadList} />
      )}
    </div>
  );
};

export default EInvoicing;
