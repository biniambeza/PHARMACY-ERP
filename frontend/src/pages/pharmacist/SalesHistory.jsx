import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getSales, getSalesSummary } from '../../api/salesApi';
import InvoiceReceiptModal from './InvoiceReceiptModal';

const SalesHistory = () => {
  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Receipt Modal
  const [selectedSale, setSelectedSale] = useState(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const params = {};
      if (search) params.search = search;

      const [salesRes, summaryRes] = await Promise.all([
        getSales(params),
        getSalesSummary(),
      ]);

      setSales(salesRes.sales || []);
      setSummary(summaryRes.summary || null);
    } catch (err) {
      console.error('Failed to load sales history:', err);
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
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 selection:bg-emerald-500 selection:text-white">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-800 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link
                to="/pharmacy"
                className="text-xs text-slate-400 hover:text-emerald-400 transition"
              >
                ← Dashboard
              </Link>
              <span className="text-slate-600">•</span>
              <Link
                to="/pharmacy/pos"
                className="text-xs text-slate-400 hover:text-emerald-400 transition"
              >
                Cashier POS Terminal
              </Link>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Sales & Invoice History</h1>
            <p className="text-xs text-slate-400">
              Audit recorded transactions, review daily revenue, and reprint patient sales receipts
            </p>
          </div>

          <Link
            to="/pharmacy/pos"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-md transition cursor-pointer self-start sm:self-auto"
          >
            <span>💳</span> Open POS Terminal
          </Link>
        </div>

        {/* Sales Performance Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
                Today's Revenue
              </span>
              <p className="text-2xl font-bold text-emerald-400 font-mono">
                ${summary.todayRevenue.toFixed(2)}
              </p>
            </div>

            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
                Today's Orders
              </span>
              <p className="text-2xl font-bold text-white font-mono">{summary.todaySalesCount}</p>
            </div>

            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
                Total Revenue
              </span>
              <p className="text-2xl font-bold text-emerald-400 font-mono">
                ${summary.totalRevenue.toFixed(2)}
              </p>
            </div>

            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
                Total Invoices
              </span>
              <p className="text-2xl font-bold text-white font-mono">{summary.totalSalesCount}</p>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="bg-slate-800 border border-slate-700/80 rounded-xl p-4 flex items-center justify-between gap-3">
          <div className="w-full sm:w-80">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by invoice #, customer name or phone..."
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 transition cursor-pointer"
            >
              Clear Search
            </button>
          )}
        </div>

        {/* Invoices Table */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center text-xs text-slate-400">Loading sales records...</div>
            ) : sales.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm font-semibold text-slate-300 mb-1">
                  {search ? 'No matching invoices found' : 'No sales recorded yet'}
                </p>
                <p className="text-xs text-slate-500 mb-4">
                  {search
                    ? 'Try different search keywords.'
                    : 'Process transactions using the Cashier POS to record your first sale.'}
                </p>
                <Link
                  to="/pharmacy/pos"
                  className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-semibold rounded-lg transition inline-block"
                >
                  Go to POS Terminal
                </Link>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-700/60">
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
                <tbody className="divide-y divide-slate-700/60">
                  {sales.map((sale) => (
                    <tr key={sale._id} className="hover:bg-slate-700/30 transition">
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-emerald-400">{sale.invoiceNumber}</span>
                      </td>
                      <td className="py-3 px-4 text-slate-300 font-mono">
                        {new Date(sale.createdAt).toLocaleDateString()}
                        <span className="text-[10px] text-slate-500 block">
                          {new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-white block">
                          {sale.customer?.name || 'Walk-in Customer'}
                        </span>
                        {sale.customer?.phone && (
                          <span className="text-[11px] text-slate-400 font-mono">{sale.customer.phone}</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-slate-300">
                          {sale.items?.length || 0} item{sale.items?.length > 1 ? 's' : ''}
                        </span>
                        <span className="text-[10px] text-slate-500 block truncate max-w-xs">
                          {sale.items?.map((it) => `${it.name} (x${it.quantity})`).join(', ')}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-900 text-slate-300 border border-slate-700 font-mono">
                          {sale.paymentMethod}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-bold text-emerald-400 font-mono text-sm">
                          ${sale.grandTotal.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleOpenReceipt(sale)}
                          className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[11px] font-medium transition cursor-pointer"
                        >
                          View Receipt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
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
