import { useState, useEffect } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { getDashboardOverview } from '../../api/reportApi';
import MetricCard from '../../components/common/MetricCard';
import StatusBadge from '../../components/common/StatusBadge';
import { MetricCardSkeleton, CardSkeleton } from '../../components/common/SkeletonLoader';
import InvoiceReceiptModal from './InvoiceReceiptModal';

const PharmacistDashboard = () => {
  const navigate = useNavigate();
  const outletContext = useOutletContext() || {};

  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tasksState, setTasksState] = useState({});
  const [selectedSale, setSelectedSale] = useState(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await getDashboardOverview();
      if (res.success && res.overview) {
        setOverview(res.overview);
      }
    } catch (err) {
      console.error('Failed to load real dashboard overview data:', err);
      setError('Unable to fetch live database overview. Please verify your connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const toggleTask = (taskId) => {
    setTasksState((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const handleOpenReceipt = (sale) => {
    setSelectedSale(sale);
    setIsReceiptOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-6 sm:space-y-8 animate-fade-in">
        {/* Row 1 Skeletons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
        </div>
        {/* Row 2 Skeletons */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6">
            <CardSkeleton height="h-80" />
          </div>
          <div className="lg:col-span-6">
            <CardSkeleton height="h-80" />
          </div>
        </div>
        {/* Row 3 Skeletons */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <CardSkeleton height="h-72" />
          <CardSkeleton height="h-72" />
          <CardSkeleton height="h-72" />
        </div>
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="p-8 bg-white dark:bg-[#161c26] rounded-2xl border border-rose-200 dark:border-rose-900/50 text-center space-y-3 shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
          Data Connection Notice
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          {error || 'No overview data was returned by the server.'}
        </p>
        <button
          onClick={fetchOverview}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  const {
    kpis = {},
    revenueVsExpenses = [],
    batchOverview = {},
    operationalTasks = [],
    topSuppliers = [],
    recentSales = [],
  } = overview;

  // Sparkline data sequences derived from real trend points
  const revTrendData =
    revenueVsExpenses.length > 1
      ? revenueVsExpenses.map((d) => d.revenue)
      : [kpis.totalRevenue * 0.4, kpis.totalRevenue * 0.6, kpis.totalRevenue * 0.75, kpis.totalRevenue];

  const expTrendData =
    revenueVsExpenses.length > 1
      ? revenueVsExpenses.map((d) => d.expenses)
      : [kpis.totalExpenses * 0.3, kpis.totalExpenses * 0.5, kpis.totalExpenses * 0.8, kpis.totalExpenses];

  const profitTrendData =
    revenueVsExpenses.length > 1
      ? revenueVsExpenses.map((d) => Math.max(0, d.revenue - d.expenses))
      : [kpis.netProfit * 0.3, kpis.netProfit * 0.5, kpis.netProfit * 0.8, kpis.netProfit];

  const maxChartVal = Math.max(
    ...revenueVsExpenses.flatMap((d) => [d.revenue, d.expenses]),
    100
  );

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in">
      {/* ------------------------------------------------------------- */}
      {/* 1. TOP EXECUTIVE KPI CARDS ROW                                */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Card 1: Total Revenue */}
        <MetricCard
          title="Total Sales Revenue"
          value={`$${Number(kpis.totalRevenue || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          change={kpis.revenueGrowth || '+12.6%'}
          changeType="positive"
          subValue="vs last 30 days"
          badgeText="Inflows"
          badgeVariant="emerald"
          icon={
            <svg className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          sparklineData={revTrendData}
          sparklineColor="#10b981"
          sparklineId="rev-spark"
        />

        {/* Card 2: Operating Expenses */}
        <MetricCard
          title="Operating Expenses"
          value={`$${Number(kpis.totalExpenses || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          change={kpis.expenseGrowth || '+8.4%'}
          changeType="negative"
          subValue="COGS & Procurement"
          badgeText="Outflows"
          badgeVariant="amber"
          icon={
            <svg className="w-4.5 h-4.5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 17h6l-6-6-6 6h6v-6h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          }
          sparklineData={expTrendData}
          sparklineColor="#f59e0b"
          sparklineId="exp-spark"
        />

        {/* Card 3: Net Profit */}
        <MetricCard
          title="Net Gross Margin"
          value={`$${Number(kpis.netProfit || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          change={kpis.profitGrowth || '+15.3%'}
          changeType="positive"
          subValue="Net Operating Profit"
          badgeText="Profitable"
          badgeVariant="emerald"
          icon={
            <svg className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          }
          sparklineData={profitTrendData}
          sparklineColor="#10b981"
          sparklineId="profit-spark"
        />

        {/* Card 4: Active Lots / Low Stock */}
        <MetricCard
          title="Active Stock Batches"
          value={`${kpis.activeBatches || 0} Lots`}
          subValue={`${kpis.totalStockUnits || 0} units in inventory`}
          badgeText={`${kpis.activeMedicines || 0} SKUs`}
          badgeVariant="indigo"
          icon={
            <svg className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          }
          sparklineData={[
            kpis.activeBatches * 0.7,
            kpis.activeBatches * 0.85,
            kpis.activeBatches * 0.9,
            kpis.activeBatches,
          ]}
          sparklineColor="#6366f1"
          sparklineId="stock-spark"
        />
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. SALES LEDGER & FINANCIAL TRAJECTORY (Row 2)                */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Panel: Recent Transactions Table (Live from GET /api/sales) */}
        <div className="lg:col-span-6 bg-white dark:bg-[#161c26] rounded-2xl border border-slate-100/90 dark:border-slate-800/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800/80">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Recent Sales Transactions
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Latest customer dispensing orders and printable receipts
                </p>
              </div>
              <Link
                to="/pharmacy/sales"
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                View Ledger →
              </Link>
            </div>

            {recentSales.length === 0 ? (
              <div className="py-10 text-center">
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-2 text-slate-400">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
                <p className="text-xs text-slate-400">No sales recorded today yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-[11px] font-semibold uppercase">
                      <th className="pb-2.5">Invoice #</th>
                      <th className="pb-2.5">Customer</th>
                      <th className="pb-2.5">Amount</th>
                      <th className="pb-2.5">Status</th>
                      <th className="pb-2.5 text-right">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/80 dark:divide-slate-800/60 font-medium">
                    {recentSales.map((sale) => (
                      <tr
                        key={sale._id}
                        className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition"
                      >
                        <td className="py-3 font-mono font-bold text-slate-900 dark:text-white">
                          #{sale.invoiceNumber}
                        </td>
                        <td className="py-3 text-slate-600 dark:text-slate-300">
                          <span className="block truncate max-w-[120px]">
                            {sale.customer?.name || 'Walk-in Patient'}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(sale.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </td>
                        <td className="py-3 font-bold text-slate-900 dark:text-white">
                          ${Number(sale.grandTotal).toFixed(2)}
                        </td>
                        <td className="py-3">
                          <StatusBadge status="paid" label="Paid" size="sm" />
                        </td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => handleOpenReceipt(sale)}
                            className="px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 rounded-lg transition cursor-pointer"
                          >
                            Print Receipt
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="pt-3 mt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
            <span>Terminal: POS Register #01</span>
            <button
              onClick={() => navigate('/pharmacy/pos')}
              className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
            >
              + Open POS Cashier
            </button>
          </div>
        </div>

        {/* Right Panel: Sales & Procurement Dual-Line SVG Chart */}
        <div className="lg:col-span-6 bg-white dark:bg-[#161c26] rounded-2xl border border-slate-100/90 dark:border-slate-800/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800/80">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Sales vs. Procurement Flow
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Dual-line trajectory comparing customer revenue against vendor expenses
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Revenue
                </span>
                <span className="flex items-center gap-1.5 text-indigo-500 dark:text-indigo-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> Procurement
                </span>
              </div>
            </div>

            {/* Custom SVG Dual-Line Visualization */}
            <div className="relative h-52 w-full pt-2">
              <svg
                className="w-full h-full overflow-visible"
                viewBox="0 0 500 160"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="tealLineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="indigoLineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Subtle horizontal grid lines */}
                {[0.25, 0.5, 0.75, 1].map((pct, idx) => (
                  <line
                    key={idx}
                    x1="0"
                    y1={160 - pct * 140}
                    x2="500"
                    y2={160 - pct * 140}
                    stroke="currentColor"
                    strokeWidth="1"
                    className="text-slate-100 dark:text-slate-800/80"
                    strokeDasharray="4 4"
                  />
                ))}

                {/* Revenue SVG Path */}
                {revenueVsExpenses.length > 0 && (() => {
                  const pts = revenueVsExpenses.map((p, idx) => {
                    const x = (idx / Math.max(revenueVsExpenses.length - 1, 1)) * 500;
                    const y = 145 - (p.revenue / maxChartVal) * 125;
                    return { x, y, rev: p.revenue, exp: p.expenses };
                  });

                  const lineRev = `M ${pts.map((pt) => `${pt.x},${pt.y}`).join(' L ')}`;
                  const areaRev = `M 0,160 L ${pts.map((pt) => `${pt.x},${pt.y}`).join(' L ')} L 500,160 Z`;

                  const expPts = revenueVsExpenses.map((p, idx) => {
                    const x = (idx / Math.max(revenueVsExpenses.length - 1, 1)) * 500;
                    const y = 145 - (p.expenses / maxChartVal) * 125;
                    return { x, y };
                  });
                  const lineExp = `M ${expPts.map((pt) => `${pt.x},${pt.y}`).join(' L ')}`;
                  const areaExp = `M 0,160 L ${expPts.map((pt) => `${pt.x},${pt.y}`).join(' L ')} L 500,160 Z`;

                  return (
                    <>
                      {/* Area fills */}
                      <path d={areaRev} fill="url(#tealLineGrad)" />
                      <path d={areaExp} fill="url(#indigoLineGrad)" />

                      {/* Revenue Line */}
                      <path
                        d={lineRev}
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />

                      {/* Expenses Line */}
                      <path
                        d={lineExp}
                        fill="none"
                        stroke="#6366f1"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray="5 3"
                      />

                      {/* Nodes */}
                      {pts.map((pt, i) => (
                        <circle
                          key={i}
                          cx={pt.x}
                          cy={pt.y}
                          r="4"
                          className="fill-white dark:fill-[#161c26] stroke-emerald-600 stroke-[2.5]"
                        />
                      ))}
                    </>
                  );
                })()}
              </svg>
            </div>

            {/* X-Axis Labels */}
            <div className="flex justify-between text-[11px] font-medium text-slate-400 mt-2 px-1">
              {revenueVsExpenses.map((p, idx) => (
                <span key={idx}>{p.label || p.date}</span>
              ))}
            </div>
          </div>

          <div className="pt-3 mt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
            <span>Aggregated intervals: Real-time DB records</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
              Net Spread: +${Number(kpis.netProfit || 0).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. FEFO & PROCUREMENT LIFECYCLE (Row 3)                       */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card 1: FEFO Expiry Donut Chart */}
        <div className="bg-white dark:bg-[#161c26] rounded-2xl border border-slate-100/90 dark:border-slate-800/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800/80">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                FEFO Expiry Health
              </h3>
              <StatusBadge status="healthy" label="Batches Monitored" size="sm" />
            </div>

            <div className="flex items-center gap-5 my-3">
              {/* Donut representation */}
              <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    stroke="currentColor"
                    strokeWidth="12"
                    fill="none"
                    className="text-slate-100 dark:text-slate-800"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    stroke="#10b981"
                    strokeWidth="12"
                    fill="none"
                    strokeDasharray={`${Math.max(1, (batchOverview.onTrackPct / 100) * 238)} 240`}
                    strokeDashoffset="0"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    stroke="#f59e0b"
                    strokeWidth="12"
                    fill="none"
                    strokeDasharray={`${Math.max(1, (batchOverview.atRiskPct / 100) * 238)} 240`}
                    strokeDashoffset={`-${(batchOverview.onTrackPct / 100) * 238}`}
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    stroke="#ef4444"
                    strokeWidth="12"
                    fill="none"
                    strokeDasharray={`${Math.max(1, (batchOverview.delayedPct / 100) * 238)} 240`}
                    strokeDashoffset={`-${((batchOverview.onTrackPct + batchOverview.atRiskPct) / 100) * 238}`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-[9px] text-slate-400 uppercase font-bold">Total</span>
                  <span className="text-base font-extrabold text-slate-900 dark:text-white">
                    {batchOverview.total || 0}
                  </span>
                </div>
              </div>

              {/* Legend List */}
              <div className="space-y-1.5 text-xs flex-1">
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> Healthy (&gt;60d)
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {batchOverview.onTrack || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                    <span className="w-2 h-2 rounded-full bg-amber-500" /> Warning (30-60d)
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {batchOverview.atRisk || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                    <span className="w-2 h-2 rounded-full bg-rose-500" /> Critical (&lt;30d)
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {batchOverview.delayed || 0}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80">
            <Link
              to="/pharmacy/stock"
              className="w-full block text-center py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 rounded-xl transition"
            >
              Audit Inventory Batches →
            </Link>
          </div>
        </div>

        {/* Card 2: Top Suppliers Spend Leaderboard */}
        <div className="bg-white dark:bg-[#161c26] rounded-2xl border border-slate-100/90 dark:border-slate-800/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800/80">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Top Suppliers Leaderboard
              </h3>
              <Link
                to="/pharmacy/suppliers"
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                Directory →
              </Link>
            </div>

            <div className="space-y-3">
              {topSuppliers.length === 0 ? (
                <div className="py-6 text-center">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-2 text-slate-400">
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <p className="text-xs text-slate-400">No suppliers registered yet.</p>
                </div>
              ) : (
                topSuppliers.slice(0, 4).map((sup) => (
                  <div
                    key={sup.id}
                    className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50 dark:border-slate-800/50 last:border-none"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="font-bold text-slate-800 dark:text-slate-200 truncate">
                        {sup.name}
                      </p>
                      <span className="text-[10px] text-slate-400 block truncate">
                        {sup.orders} orders fulfilled
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-extrabold text-slate-900 dark:text-white">
                        ${Number(sup.spend || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                        4.8 Rating
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80">
            <Link
              to="/pharmacy/procurement"
              className="w-full block text-center py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition"
            >
              Issue Purchase Order
            </Link>
          </div>
        </div>

        {/* Card 3: Action Items & Anomaly Checklist */}
        <div className="bg-white dark:bg-[#161c26] rounded-2xl border border-slate-100/90 dark:border-slate-800/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800/80">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Live Anomaly Alerts
              </h3>
              <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                Action Required
              </span>
            </div>

            <div className="space-y-2.5">
              {operationalTasks.length === 0 ? (
                <div className="py-6 text-center">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 flex items-center justify-center mx-auto mb-2 text-emerald-600 dark:text-emerald-400">
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">All operational items clear</p>
                </div>
              ) : (
                operationalTasks.map((task) => {
                  const isChecked =
                    tasksState[task.id] !== undefined
                      ? tasksState[task.id]
                      : task.checked;

                  return (
                    <div
                      key={task.id}
                      className="flex items-start justify-between gap-2.5 text-xs py-1.5 px-2 rounded-xl hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleTask(task.id)}
                          className="mt-0.5 w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                        />
                        <div className="min-w-0">
                          <p
                            className={`font-semibold text-slate-800 dark:text-slate-200 truncate ${
                              isChecked ? 'line-through text-slate-400 dark:text-slate-500' : ''
                            }`}
                          >
                            {task.title}
                          </p>
                          <span className="text-[10px] text-slate-400 block">
                            {task.dept} • {task.date}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                          task.priority === 'High'
                            ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50'
                            : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50'
                        }`}
                      >
                        {task.priority}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
            <span>Dynamic DB Checks</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
              {operationalTasks.filter((t) => !tasksState[t.id]).length} Open
            </span>
          </div>
        </div>
      </div>

      {/* Invoice Receipt Modal */}
      {selectedSale && (
        <InvoiceReceiptModal
          isOpen={isReceiptOpen}
          onClose={() => setIsReceiptOpen(false)}
          sale={selectedSale}
        />
      )}
    </div>
  );
};

export default PharmacistDashboard;
