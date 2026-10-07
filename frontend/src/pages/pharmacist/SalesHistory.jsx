import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Receipt,
  ShoppingCart,
  Calendar,
  DollarSign,
  TrendingUp,
  Search,
  Eye,
  CreditCard,
  Building2,
  FileText,
  User,
  Phone,
  ArrowUpRight,
  RotateCw,
  AlertCircle,
} from 'lucide-react';
import { getSales, getSalesSummary } from '../../api/salesApi';
import InvoiceReceiptModal from './InvoiceReceiptModal';
import MetricCard from '../../components/common/MetricCard';
import StatusBadge from '../../components/common/StatusBadge';
import { CardSkeleton, MetricCardSkeleton } from '../../components/common/SkeletonLoader';

const SalesHistory = () => {
  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Receipt Modal
  const [selectedSale, setSelectedSale] = useState(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

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
        setError(salesResult.reason?.response?.data?.message || 'Failed to load sales transactions');
      }

      if (summaryResult.status === 'fulfilled' && summaryResult.value?.summary) {
        setSummary(summaryResult.value.summary);
      } else if (loadedSales.length > 0) {
        // Fallback compute summary from sales if summary endpoint fails
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const today = loadedSales.filter((s) => new Date(s.createdAt) >= startOfToday);
        setSummary({
          todaySalesCount: today.length,
          todayRevenue: today.reduce((acc, s) => acc + (Number(s.grandTotal) || 0), 0),
          totalSalesCount: loadedSales.length,
          totalRevenue: loadedSales.reduce((acc, s) => acc + (Number(s.grandTotal) || 0), 0),
        });
      }
    } catch (err) {
      console.error('Failed to load sales history:', err);
      setError('Unable to load dispensary ledger. Please check your network connection.');
    } finally {
      setLoading(false);
    }
  }, [search]);

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
            <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/50 px-2.5 py-0.5 rounded-full border border-teal-200 dark:border-teal-800/60 uppercase tracking-wider">
              Dispensary Ledger
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">
            Sales & Invoice Ledger
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Audit recorded transactions, review daily dispensary revenue, and reprint patient sales receipts
          </p>
        </div>

        <Link
          to="/pharmacy/pos"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer self-start sm:self-auto shrink-0"
        >
          <ShoppingCart className="w-4 h-4" />
          <span>Open POS Terminal</span>
        </Link>
      </div>

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
            Retry Loading
          </button>
        </div>
      )}

      {/* KPI Metric Cards */}
      {summary ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          <MetricCard
            title="Today's Revenue"
            value={`$${(Number(summary.todayRevenue) || 0).toFixed(2)}`}
            subValue="Dispensary sales today"
            badgeText="Today"
            badgeVariant="teal"
            icon={<DollarSign className="w-4.5 h-4.5 text-teal-600 dark:text-teal-400" />}
            sparklineColor="#0d9488"
            sparklineId="sales-today-rev-spark"
          />
          <MetricCard
            title="Today's Orders"
            value={(summary.todaySalesCount || 0).toString()}
            subValue="Checkout transactions today"
            badgeText="Orders"
            badgeVariant="teal"
            icon={<ShoppingCart className="w-4.5 h-4.5 text-cyan-600 dark:text-cyan-400" />}
            sparklineColor="#06b6d4"
            sparklineId="sales-today-orders-spark"
          />
          <MetricCard
            title="Total Revenue"
            value={`$${(Number(summary.totalRevenue) || 0).toFixed(2)}`}
            subValue="Cumulative gross billing"
            badgeText="Gross"
            badgeVariant="indigo"
            icon={<TrendingUp className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" />}
            sparklineColor="#6366f1"
            sparklineId="sales-total-rev-spark"
          />
          <MetricCard
            title="Total Invoices"
            value={(summary.totalSalesCount || 0).toString()}
            subValue="All recorded receipts"
            badgeText="Receipts"
            badgeVariant="blue"
            icon={<Receipt className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />}
            sparklineColor="#3b82f6"
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
            placeholder="Search by invoice #, customer name or phone..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition"
          />
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white px-2 py-1 transition cursor-pointer"
            >
              Clear Search
            </button>
          )}

          <button
            onClick={loadData}
            disabled={loading}
            title="Refresh sales ledger"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Invoices Table Card */}
      <div className="bg-white dark:bg-[#161c26] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          {loading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading sales records...</div>
          ) : sales.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <Receipt className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">
                {search ? 'No matching invoices found' : 'No sales recorded yet'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-4">
                {search
                  ? 'Try adjusting your search keywords to find the desired invoice record.'
                  : 'Process transactions using the Cashier POS to record your first sale.'}
              </p>
              <Link
                to="/pharmacy/pos"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-xl shadow-xs transition"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Go to POS Terminal</span>
              </Link>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800 text-[11px]">
                <tr>
                  <th className="py-3 px-4">Invoice No</th>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Items Sold</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4 text-right">Grand Total</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {sales.map((sale) => (
                  <tr key={sale._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition group">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                          <Receipt className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-mono font-bold text-teal-700 dark:text-teal-400">
                          {sale.invoiceNumber}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 font-mono">
                      {sale.createdAt ? new Date(sale.createdAt).toLocaleDateString() : 'N/A'}
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 block">
                        {sale.createdAt
                          ? new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : ''}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-900 dark:text-white block">
                        {sale.customer?.name || 'Walk-in Customer'}
                      </span>
                      {sale.customer?.phone && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                          {sale.customer.phone}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-slate-700 dark:text-slate-300 font-medium">
                        {sale.items?.length || 0} item{(sale.items?.length || 0) !== 1 ? 's' : ''}
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
                        ${(Number(sale.grandTotal) || 0).toFixed(2)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleOpenReceipt(sale)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-teal-50 hover:text-teal-700 dark:bg-slate-800 dark:hover:bg-teal-900/40 dark:hover:text-teal-300 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Receipt</span>
                      </button>
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
    </div>
  );
};

export default SalesHistory;
