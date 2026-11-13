import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Undo2, Search, RotateCw, AlertCircle, FileText, ChevronLeft, ChevronRight, Receipt } from 'lucide-react';
import { getReturns, getReturnById } from '../../api/returnApi';
import { formatMoney, formatDateTime } from '../../utils/format';
import { useAuth } from '../../context/useAuth';
import CreditNote from '../../components/returns/CreditNote';

const LIMIT = 25;

const Returns = () => {
  const { t } = useTranslation('returns');
  const { activePharmacy } = useAuth();
  const [returns, setReturns] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: LIMIT };
      if (search.trim()) params.search = search.trim();
      const data = await getReturns(params);
      setReturns(data.returns || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.response?.data?.message || t('errors.load'));
    } finally {
      setLoading(false);
    }
  }, [page, search, t]);

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [load]);

  const openNote = async (ret) => {
    setSelected(ret);
    try {
      const data = await getReturnById(ret._id);
      if (data?.return) setSelected(data.return);
    } catch {
      // keep the list version
    }
  };

  const pages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800/60 uppercase tracking-wider">
            {t('page.badge')}
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">
            {t('page.title')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('page.subtitle')}
          </p>
        </div>
        <Link
          to="/pharmacy/sales"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-xs transition self-start sm:self-auto shrink-0"
        >
          <Receipt className="w-4 h-4" />
          <span>{t('page.salesHistory')}</span>
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-2xl flex items-center gap-2.5 text-xs text-rose-700 dark:text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="p-4 bg-white dark:bg-[#161c26] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t('page.searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
          />
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-50 self-start sm:self-auto"
        >
          <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{t('common:buttons.refresh')}</span>
        </button>
      </div>

      <div className="bg-white dark:bg-[#161c26] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          {loading ? (
            <div className="p-12 text-center text-xs text-slate-400">{t('page.loading')}</div>
          ) : returns.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <Undo2 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {search ? t('page.noMatch') : t('page.none')}
              </h3>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800 text-[11px]">
                <tr>
                  <th className="py-3 px-4">{t('table.returnNo')}</th>
                  <th className="py-3 px-4">{t('table.invoice')}</th>
                  <th className="py-3 px-4">{t('common:labels.date')}</th>
                  <th className="py-3 px-4">{t('table.items')}</th>
                  <th className="py-3 px-4">{t('table.reason')}</th>
                  <th className="py-3 px-4">{t('table.processedBy')}</th>
                  <th className="py-3 px-4 text-right">{t('table.refund')}</th>
                  <th className="py-3 px-4 text-right">{t('common:labels.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {returns.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-amber-700 dark:text-amber-400">{r.returnNumber}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-700 dark:text-slate-300">{r.invoiceNumber}</td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">{formatDateTime(r.createdAt)}</td>
                    <td className="py-3.5 px-4">
                      <span className="text-[11px] text-slate-600 dark:text-slate-300 block truncate max-w-xs">
                        {r.items.map((it) => `${it.name} (x${it.quantity}${it.restocked ? '' : `, ${t('page.discarded')}`})`).join(', ')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 max-w-[12rem] truncate">{r.reason}</td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">{r.processedBy?.name || '-'}</td>
                    <td className="py-3.5 px-4 text-right font-bold font-mono text-slate-900 dark:text-white">
                      {formatMoney(r.refundTotal)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => openNote(r)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-amber-50 hover:text-amber-700 dark:bg-slate-800 dark:hover:bg-amber-900/40 dark:hover:text-amber-300 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>{t('creditNote.title')}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            <span>
              {t('page.pagination', { page, pages, count: total })}
            </span>
            <div className="flex gap-1.5">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <CreditNote ret={selected} pharmacyName={activePharmacy?.name} onClose={() => setSelected(null)} />
      )}
    </div>
  );
};

export default Returns;
