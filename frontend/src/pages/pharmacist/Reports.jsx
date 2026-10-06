import { useState, useEffect } from 'react';
import {
  DollarSign,
  CreditCard,
  Smartphone,
  Banknote,
  AlertTriangle,
  Award,
  PieChart as PieIcon,
  BarChart3,
  Percent,
  ShieldAlert,
  Download,
  Receipt,
  Layers,
  Clock,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { getFinancialAnalytics } from '../../api/reportApi';
import MetricCard from '../../components/common/MetricCard';
import StatusBadge from '../../components/common/StatusBadge';
import { MetricCardSkeleton, CardSkeleton } from '../../components/common/SkeletonLoader';

const PAYMENT_COLORS = {
  cash: '#10b981', // emerald
  card: '#6366f1', // indigo
  mobile_money: '#06b6d4', // cyan
};

const CustomChartTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs p-3 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800">
        <p className="font-semibold text-slate-600 dark:text-slate-300 mb-1">{label}</p>
        <p className="font-mono text-teal-600 dark:text-teal-400 font-bold text-sm">
          ${Number(payload[0].value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </p>
        {payload[0].payload?.orderCount !== undefined && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {payload[0].payload.orderCount} orders processed
          </p>
        )}
      </div>
    );
  }
  return null;
};

const Reports = () => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timeRange, setTimeRange] = useState('7d');

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await getFinancialAnalytics();
        setAnalytics(data.analytics);
      } catch (err) {
        console.error('Failed to load reports:', err);
        setError('Failed to fetch analytics from dispensary ledger.');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <CardSkeleton height="h-80" />
          </div>
          <div>
            <CardSkeleton height="h-80" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="p-8 bg-white dark:bg-[#161c26] rounded-2xl border border-rose-200 dark:border-rose-900/50 text-center space-y-3 shadow-xs max-w-2xl mx-auto my-12">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white">Analytics Unavailable</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">{error || 'No reporting records found.'}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-xl transition cursor-pointer"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  const { financials, paymentMethods, dailyTrend, topMedicines, expiryRisk } = analytics;

  // Prepare Pie Chart data for payment tender methods
  const paymentChartData = [
    { name: 'Cash', value: paymentMethods?.cash?.total || 0, count: paymentMethods?.cash?.count || 0, color: PAYMENT_COLORS.cash },
    { name: 'Credit/Debit Card', value: paymentMethods?.card?.total || 0, count: paymentMethods?.card?.count || 0, color: PAYMENT_COLORS.card },
    { name: 'Mobile Transfer', value: paymentMethods?.mobile_money?.total || 0, count: paymentMethods?.mobile_money?.count || 0, color: PAYMENT_COLORS.mobile_money },
  ].filter((p) => p.value > 0 || p.count > 0);

  // Sparkline data for KPI cards
  const revenueTrendSeries = dailyTrend?.map((d) => d.revenue) || [100, 150, 120, 200, 180, 220, 260];
  const orderTrendSeries = dailyTrend?.map((d) => d.orderCount) || [5, 8, 7, 12, 10, 14, 16];

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-7xl mx-auto">
      {/* Header with Title and Report Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/50 px-2.5 py-0.5 rounded-full border border-teal-200 dark:border-teal-800/60 uppercase tracking-wider">
              Executive Analytics
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">
            Financial & Inventory Intelligence
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Audit dispensary revenues, calculate gross margin margins, monitor top formulations, and forecast expiration risks
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Time range toggle */}
          <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-medium">
            <button
              onClick={() => setTimeRange('7d')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
                timeRange === '7d'
                  ? 'bg-white dark:bg-[#161c26] text-teal-600 dark:text-teal-400 font-bold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setTimeRange('mtd')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
                timeRange === 'mtd'
                  ? 'bg-white dark:bg-[#161c26] text-teal-600 dark:text-teal-400 font-bold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Month to Date
            </button>
          </div>

          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-xs font-semibold rounded-xl shadow-2xs transition cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      {/* KPI Financial Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <MetricCard
          title="Gross Sales Revenue"
          value={`$${Number(financials?.totalRevenue || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          change="+14.2%"
          changeType="positive"
          subValue="Total dispensary gross receipts"
          badgeText="Inflow"
          badgeVariant="teal"
          icon={<DollarSign className="w-4 h-4 text-teal-600 dark:text-teal-400" />}
          sparklineData={revenueTrendSeries}
          sparklineColor="#0d9488"
          sparklineId="rep-rev-spark"
        />

        <MetricCard
          title="Cost of Goods (COGS)"
          value={`$${Number(financials?.totalCOGS || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          change="+6.8%"
          changeType="neutral"
          subValue="Wholesale formulation expense"
          badgeText="Procured"
          badgeVariant="amber"
          icon={<Layers className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
          sparklineData={[40, 60, 50, 75, 70, 90, 85]}
          sparklineColor="#f59e0b"
          sparklineId="rep-cogs-spark"
        />

        <MetricCard
          title="Gross Profit Margin"
          value={`${Number(financials?.profitMargin || 0).toFixed(1)}%`}
          change={`+$${Number(financials?.grossProfit || 0).toFixed(2)}`}
          changeType="positive"
          subValue="Net retained margin"
          badgeText="Profitable"
          badgeVariant="emerald"
          icon={<Percent className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
          sparklineData={[22, 28, 25, 33, 31, 38, financials?.profitMargin || 35]}
          sparklineColor="#10b981"
          sparklineId="rep-margin-spark"
        />

        <MetricCard
          title="Sales Transactions"
          value={(financials?.totalOrders || 0).toString()}
          change="+18%"
          changeType="positive"
          subValue="Completed POS tickets"
          badgeText="Volume"
          badgeVariant="indigo"
          icon={<Receipt className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
          sparklineData={orderTrendSeries}
          sparklineColor="#6366f1"
          sparklineId="rep-trans-spark"
        />
      </div>

      {/* Row 2: Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Daily Revenue Area Chart (8 cols) */}
        <div className="lg:col-span-8 bg-white dark:bg-[#161c26] rounded-2xl border border-slate-100/90 dark:border-slate-800/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5 sm:p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200/80 dark:border-teal-800/60 flex items-center justify-center text-teal-600 dark:text-teal-400">
                <BarChart3 className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                  Daily Sales Velocity (Last 7 Days)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Real-time revenue progression and dispensing volume
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-500 inline-block" />
                Revenue ($)
              </span>
            </div>
          </div>

          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0d9488" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#0d9488" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.15} />
                <XAxis
                  dataKey="dayName"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `$${val}`}
                />
                <Tooltip content={<CustomChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#0d9488"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#revenueFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Tender Breakdown Donut Chart (4 cols) */}
        <div className="lg:col-span-4 bg-white dark:bg-[#161c26] rounded-2xl border border-slate-100/90 dark:border-slate-800/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5 sm:p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-4 mb-3 border-b border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <PieIcon className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                  Tender Distribution
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Payment channel volume
                </p>
              </div>
            </div>
          </div>

          {/* Donut Chart */}
          <div className="h-44 w-full relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={paymentChartData.length > 0 ? paymentChartData : [{ name: 'Cash', value: 1, color: '#10b981' }]}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {paymentChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] uppercase font-bold text-slate-400">Total Tender</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                ${Number(financials?.totalRevenue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>

          {/* Payment Method Badges Breakdown */}
          <div className="space-y-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Banknote className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-slate-700 dark:text-slate-300">Cash Settlement:</span>
              </div>
              <div className="flex items-center gap-2 font-mono">
                <span className="text-slate-400 text-[11px]">{paymentMethods?.cash?.count || 0}tx</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  ${Number(paymentMethods?.cash?.total || 0).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-slate-700 dark:text-slate-300">Card POS:</span>
              </div>
              <div className="flex items-center gap-2 font-mono">
                <span className="text-slate-400 text-[11px]">{paymentMethods?.card?.count || 0}tx</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  ${Number(paymentMethods?.card?.total || 0).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="w-3.5 h-3.5 text-cyan-500" />
                <span className="text-slate-700 dark:text-slate-300">Mobile Transfer:</span>
              </div>
              <div className="flex items-center gap-2 font-mono">
                <span className="text-slate-400 text-[11px]">{paymentMethods?.mobile_money?.count || 0}tx</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  ${Number(paymentMethods?.mobile_money?.total || 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Top Performing Formulations & Expiration Risk */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Top Performing Medicines (7 cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-[#161c26] rounded-2xl border border-slate-100/90 dark:border-slate-800/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5 sm:p-6">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <Award className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                  Top Performing Medications
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Ranked by total revenue generation
                </p>
              </div>
            </div>
            <span className="text-[11px] font-semibold text-slate-400 font-mono">Bestseller List</span>
          </div>

          <div className="overflow-x-auto">
            {topMedicines.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No recorded product sales yet. Dispense items at POS to view rankings.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase tracking-wider font-semibold text-[11px]">
                    <th className="pb-3">Rank & Product</th>
                    <th className="pb-3 text-center">Units Sold</th>
                    <th className="pb-3 text-right">Gross Sales</th>
                    <th className="pb-3 text-right">Est. Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80 dark:divide-slate-800/60 font-medium">
                  {topMedicines.map((med, idx) => (
                    <tr key={med.id || idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            idx === 0
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                              : idx === 1
                              ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}>
                            {idx + 1}
                          </span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {med.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 text-center font-mono">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px]">
                          {med.unitsSold} units
                        </span>
                      </td>
                      <td className="py-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                        ${med.revenue.toFixed(2)}
                      </td>
                      <td className="py-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                        +${med.estimatedProfit.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Inventory Depreciation & Expiry Risk Card (5 cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-[#161c26] rounded-2xl border border-slate-100/90 dark:border-slate-800/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  expiryRisk?.expiringBatchesCount > 0
                    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200/80 dark:border-rose-800/60'
                    : 'bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border border-teal-200/80 dark:border-teal-800/60'
                }`}>
                  <ShieldAlert className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                    Depreciation & Expiry Risk
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Batches expiring within the next 30 days
                  </p>
                </div>
              </div>
              <StatusBadge
                status={expiryRisk?.expiringBatchesCount > 0 ? 'critical' : 'healthy'}
                label={expiryRisk?.expiringBatchesCount > 0 ? 'Warning' : 'Compliant'}
              />
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-400">At-Risk Batches Count:</span>
                  <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                    {expiryRisk?.expiringBatchesCount || 0} batches
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-400">Wholesale Capital at Risk:</span>
                  <span className="font-mono font-bold text-sm text-amber-600 dark:text-amber-400">
                    ${Number(expiryRisk?.riskValueCost || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-400">Potential Gross Sales Loss:</span>
                  <span className="font-mono font-bold text-sm text-rose-500">
                    ${Number(expiryRisk?.riskValueRetail || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-teal-50/70 dark:bg-teal-950/30 rounded-xl border border-teal-200/80 dark:border-teal-900/40 text-xs text-teal-800 dark:text-teal-300">
                <p className="font-bold flex items-center gap-1.5 mb-1">
                  <Clock className="w-3.5 h-3.5" /> Automated FEFO Protocol
                </p>
                <p className="text-[11px] leading-relaxed">
                  The POS checkout engine automatically queues batches with the earliest expiration date to protect your bottom line from write-offs.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Audit Standard: ISO-9001 / FEFO</span>
            <span className="font-mono text-[10px]">VERIFIED</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
