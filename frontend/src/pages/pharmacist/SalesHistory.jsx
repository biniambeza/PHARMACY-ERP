import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Receipt,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  Search,
  Eye,
  RotateCw,
  AlertCircle,
  Undo2,
  Ban,
} from 'lucide-react';
import { getSales, getSalesSummary } from '../../api/salesApi';
import InvoiceReceiptModal from './InvoiceReceiptModal';
import { formatMoney } from '../../utils/format';
import MetricCard from '../../components/common/MetricCard';
import { MetricCardSkeleton } from '../../components/common/SkeletonLoader';
import ReturnModal from '../../components/returns/ReturnModal';
import VoidSaleModal from '../../components/returns/VoidSaleModal';
import { useAuth } from '../../context/AuthContext';

const isToday = (d) => d && new Date(d).toLocaleDateString('en-CA') === new Date().toLocaleDateString('en-CA');

const SalesHistory = () => {
  const { t } = useTranslation('sales');
  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Receipt Modal
  const [selectedSale, setSelectedSale] = useState(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  // Returns & voids (#2)
  const { can } = useAuth();
  const [returnSale, setReturnSale] = useState(null);
  const [voidingSale, setVoidingSale] = useState(null);
  const [notice, setNotice] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (search) params.search = search;

      const [salesResult, summaryResult] = await Promise.allSettled([
        getSales(params),
        getSalesSummary(),
      ]);

      let loadedSales = [];
      if (salesResult.status === 'fulfilled' && salesResult.value?.sales) {
        loadedSales = salesResult.value.sales;
        setSales(loadedSales);
      } else if (salesResult.status === 'rejected') {
        console.error('Failed to load sales list:', salesResult.reason);
        setError(salesResult.reason?.response?.data?.message || t('errors.loadSales'));
      }

      if (summaryResult.status === 'fulfilled' && summaryResult.value?.summary) {
        setSummary(summaryResult.value.summary);
      } else if (loadedSales.length > 0) {
        // Fallback compute summary from sales if summary endpoint fails
        const todayStr = new Date().toLocaleDateString('en-CA');
        const today = loadedSales.filter((s) => s.createdAt && new Date(s.createdAt).toLocaleDateString('en-CA') === todayStr);
        setSummary({
          todaySalesCount: today.length,
          todayRevenue: today.reduce((acc, s) => acc + (Number(s.grandTotal) || 0), 0),
          totalSalesCount: loadedSales.length,
          totalRevenue: loadedSales.reduce((acc, s) => acc + (Number(s.grandTotal) || 0), 0),
        });
      }
    } catch (err) {
      console.error('Failed to load sales history:', err);
      setError(t('errors.loadLedger'));
    } finally {
      setLoading(false);
    }
  }, [search, t]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 300);
    return () => clearTimeout(timer);
  }, [loadData]);

  const handleOpenReceipt = (sale) => {
    setSelectedSale(sale);
    setIsReceiptOpen(true);
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 uppercase tracking-wider">
              {t('badge')}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">
            {t('title')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('subtitle')}
          </p>
        </div>

        <Link
          to="/pharmacy/pos"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer self-start sm:self-auto shrink-0"
        >
          <ShoppingCart className="w-4 h-4" />
          <span>{t('openPos')}</span>
        </Link>
      </div>

      {notice && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-2xl flex items-center justify-between gap-3 text-xs text-emerald-700 dark:text-emerald-300">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="font-semibold cursor-pointer">{t('dismiss')}</button>
        </div>
      )}

      {/* Error Notice */}
      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-700 dark:text-rose-300 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={loadData}
            className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-semibold transition cursor-pointer self-start sm:self-auto shrink-0 shadow-xs"
          >
            {t('retryLoading')}
          </button>
        </div>
      )}

      {/* KPI Metric Cards */}
      {summary ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          <MetricCard
            title={t('metrics.todayRevenue')}
            value={formatMoney(Number(summary.todayRevenue) || 0)}
            subValue={t('metrics.todayRevenueSub')}
            badgeText={t('metrics.todayBadge')}
            badgeVariant="emerald"
            icon={<DollarSign className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />}
            sparklineColor="#10b981"
            sparklineId="sales-today-rev-spark"
          />
          <MetricCard
            title={t('metrics.todayOrders')}
            value={(summary.todaySalesCount || 0).toString()}
            subValue={t('metrics.todayOrdersSub')}
            badgeText={t('metrics.ordersBadge')}
            badgeVariant="emerald"
            icon={<ShoppingCart className="w-4.5 h-4.5 text-cyan-600 dark:text-cyan-400" />}
            sparklineColor="#06b6d4"
            sparklineId="sales-today-orders-spark"
          />
          <MetricCard
            title={t('metrics.totalRevenue')}
            value={formatMoney(Number(summary.totalRevenue) || 0)}
            subValue={t('metrics.totalRevenueSub')}
            badgeText={t('metrics.grossBadge')}
            badgeVariant="indigo"
            icon={<TrendingUp className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" />}
            sparklineColor="#6366f1"
            sparklineId="sales-total-rev-spark"
          />
          <MetricCard
            title={t('metrics.totalInvoices')}
            value={(summary.totalSalesCount || 0).toString()}
            subValue={t('metrics.totalInvoicesSub')}
            badgeText={t('metrics.receiptsBadge')}
            badgeVariant="emerald"
            icon={<Receipt className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />}
            sparklineColor="#10b981"
            sparklineId="sales-total-inv-spark"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
        </div>
      )}

      {/* Toolbar & Search Bar */}
      <div className="p-4 bg-white dark:bg-[#161c26] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
          />
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white px-2 py-1 transition cursor-pointer"
            >
              {t('clearSearch')}
            </button>
          )}

          <button
            onClick={loadData}
            disabled={loading}
            title={t('refreshTitle')}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{t('common:buttons.refresh')}</span>
          </button>
        </div>
      </div>

      {/* Invoices Table Card */}
      <div className="bg-white dark:bg-[#161c26] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          {loading ? (
            <div className="p-12 text-center text-xs text-slate-400">{t('loading')}</div>
          ) : sales.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <Receipt className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">
                {search ? t('empty.noMatchTitle') : t('empty.noneTitle')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-4">
                {search ? t('empty.noMatchText') : t('empty.noneText')}
              </p>
              <Link
                to="/pharmacy/pos"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-xs transition"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>{t('goToPos')}</span>
              </Link>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800 text-[11px]">
                <tr>
                  <th className="py-3 px-4">{t('table.invoiceNo')}</th>
                  <th className="py-3 px-4">{t('table.dateTime')}</th>
                  <th className="py-3 px-4">{t('table.customer')}</th>
                  <th className="py-3 px-4">{t('table.itemsSold')}</th>
                  <th className="py-3 px-4">{t('table.payment')}</th>
                  <th className="py-3 px-4 text-right">{t('table.grandTotal')}</th>
                  <th className="py-3 px-4 text-right">{t('common:labels.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {sales.map((sale) => (
                  <tr key={sale._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition group">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                          <Receipt className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                          {sale.invoiceNumber}
                        </span>
                        {sale.voided && (
                          <span title={sale.voidReason || ''} className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60">
                            {t('voided')}
                          </span>
                        )}
                        {!sale.voided && sale.returnStatus && sale.returnStatus !== 'none' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                            {sale.returnStatus === 'full' ? t('returned') : t('partReturned')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 font-mono">
                      {sale.createdAt ? new Date(sale.createdAt).toLocaleDateString() : t('na')}
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 block">
                        {sale.createdAt
                          ? new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : ''}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-900 dark:text-white block">
                        {sale.customer?.name || t('walkIn')}
                      </span>
                      {sale.customer?.phone && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                          {sale.customer.phone}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-slate-700 dark:text-slate-300 font-medium">
                        {t('itemCount', { count: sale.items?.length || 0 })}
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate max-w-xs">
                        {sale.items?.map((it) => `${it.name} (x${it.quantity})`).join(', ')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/60 font-mono">
                        {(sale.paymentMethod || 'cash').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span className="font-bold text-slate-900 dark:text-white font-mono text-sm">
                        {formatMoney(Number(sale.grandTotal) || 0)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5 justify-end flex-wrap">
                      <button
                        onClick={() => handleOpenReceipt(sale)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 dark:bg-slate-800 dark:hover:bg-emerald-900/40 dark:hover:text-emerald-300 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{t('viewReceipt')}</span>
                      </button>
                      {!sale.voided && sale.returnStatus !== 'full' && can('sales:return') && (
                        <button
                          onClick={() => setReturnSale(sale)}
                          title={t('returnTitle')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                          <span>{t('return')}</span>
                        </button>
                      )}
                      {!sale.voided && (!sale.returnStatus || sale.returnStatus === 'none') && isToday(sale.createdAt) && can('sales:void') && (
                        <button
                          onClick={() => setVoidingSale(sale)}
                          title={t('voidTitle')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>{t('void')}</span>
                        </button>
                      )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Invoice Receipt Modal */}
      <InvoiceReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => {
          setIsReceiptOpen(false);
          setSelectedSale(null);
        }}
        sale={selectedSale}
      />

      {returnSale && (
        <ReturnModal
          sale={returnSale}
          onClose={() => setReturnSale(null)}
          onDone={(res) => {
            setReturnSale(null);
            setNotice(
              t('notices.returnRecorded', { number: res.return?.returnNumber, refund: formatMoney(res.return?.refundTotal) }) +
                (res.return?.creditReversed > 0
                  ? ` ${t('notices.returnCreditSplit', { credit: formatMoney(res.return.creditReversed), due: formatMoney(res.return.refundDue) })}`
                  : '.') +
                (res.warning ? ` ${res.warning}.` : '')
            );
            loadData();
          }}
        />
      )}
      {voidingSale && (
        <VoidSaleModal
          sale={voidingSale}
          onClose={() => setVoidingSale(null)}
          onDone={(res) => {
            setVoidingSale(null);
            setNotice(
              `${res.message}.` +
                (res.creditReversed > 0 ? ` ${t('notices.voidCredit', { amount: formatMoney(res.creditReversed) })}` : '') +
                ` ${t('notices.refundDue', { amount: formatMoney(res.refundDue) })}` +
                (res.warning ? ` ${res.warning}.` : '')
            );
            loadData();
          }}
        />
      )}
    </div>
  );
};

export default SalesHistory;
