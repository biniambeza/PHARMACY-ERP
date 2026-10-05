import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getFinancialAnalytics } from '../../api/reportApi';

const Reports = () => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const data = await getFinancialAnalytics();
        setAnalytics(data.analytics);
      } catch (err) {
        console.error('Failed to load reports:', err);
        setError('Failed to load analytics data');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 p-12 text-center text-xs text-slate-400">
        Loading financial analytics and business intelligence...
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
        <div className="max-w-4xl mx-auto text-center py-12">
          <p className="text-rose-400 text-sm mb-4">{error || 'No analytics available'}</p>
          <Link
            to="/pharmacy"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg transition"
          >
            ← Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const { financials, paymentMethods, dailyTrend, topMedicines, expiryRisk } = analytics;
  const maxDayRevenue = Math.max(...dailyTrend.map((d) => d.revenue), 1);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 selection:bg-emerald-500 selection:text-white">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-800 gap-4">
          <div>
            <Link
              to="/pharmacy"
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 mb-2 transition"
            >
              ← Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Financial Reports & Analytics
            </h1>
            <p className="text-xs text-slate-400">
              Executive overview of gross margins, daily revenue trends, bestsellers, and stock expiry risks
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Total Transactions:</span>
            <span className="font-mono font-bold text-white bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700 text-xs">
              {financials.totalOrders} sales
            </span>
          </div>
        </div>

        {/* Financial KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
              Gross Revenue
            </span>
            <p className="text-2xl font-bold text-emerald-400 font-mono">
              ${financials.totalRevenue.toFixed(2)}
            </p>
            <span className="text-[10px] text-slate-500 block mt-1">All processed sales</span>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
              Cost of Goods (COGS)
            </span>
            <p className="text-2xl font-bold text-slate-300 font-mono">
              ${financials.totalCOGS.toFixed(2)}
            </p>
            <span className="text-[10px] text-slate-500 block mt-1">Wholesale medicine costs</span>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
              Gross Profit
            </span>
            <p className="text-2xl font-bold text-emerald-400 font-mono">
              ${financials.grossProfit.toFixed(2)}
            </p>
            <span className="text-[10px] text-emerald-400/80 block mt-1">Revenue minus COGS</span>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
              Profit Margin
            </span>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold text-white font-mono">{financials.profitMargin}%</p>
              <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Healthy
              </span>
            </div>
            <span className="text-[10px] text-slate-500 block mt-1">Gross margin percentage</span>
          </div>
        </div>

        {/* 2-Column Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column (7 cols): Trends & Tender breakdown */}
          <div className="lg:col-span-7 space-y-6">
            {/* Daily Trend Chart (Last 7 Days) */}
            <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-700 mb-4">
                <h3 className="text-sm font-bold text-white">Daily Revenue Trend (Last 7 Days)</h3>
                <span className="text-[11px] text-slate-400">Past week activity</span>
              </div>

              <div className="space-y-3">
                {dailyTrend.map((day) => {
                  const percent = Math.round((day.revenue / maxDayRevenue) * 100);

                  return (
                    <div key={day.date} className="space-y-1 text-xs">
                      <div className="flex justify-between items-center text-slate-300">
                        <span className="font-semibold text-white">
                          {day.dayName} <span className="text-[10px] text-slate-500 font-mono">({day.date})</span>
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-slate-400 font-mono">
                            {day.orderCount} order{day.orderCount !== 1 ? 's' : ''}
                          </span>
                          <span className="font-mono font-bold text-emerald-400 min-w-[70px] text-right">
                            ${day.revenue.toFixed(2)}
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                        <div
                          className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${percent}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Payment Methods Distribution */}
            <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-5 shadow-xl">
              <h3 className="text-sm font-bold text-white pb-3 border-b border-slate-700 mb-4">
                Payment Tender Distribution
              </h3>

              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-700/60">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                    Cash Sales
                  </span>
                  <p className="text-lg font-bold text-emerald-400 font-mono">
                    ${paymentMethods.cash.total.toFixed(2)}
                  </p>
                  <span className="text-[10px] text-slate-500 block mt-0.5 font-mono">
                    {paymentMethods.cash.count} transactions
                  </span>
                </div>

                <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-700/60">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                    Card Sales
                  </span>
                  <p className="text-lg font-bold text-blue-400 font-mono">
                    ${paymentMethods.card.total.toFixed(2)}
                  </p>
                  <span className="text-[10px] text-slate-500 block mt-0.5 font-mono">
                    {paymentMethods.card.count} transactions
                  </span>
                </div>

                <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-700/60">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                    Mobile Money
                  </span>
                  <p className="text-lg font-bold text-amber-400 font-mono">
                    ${paymentMethods.mobile_money.total.toFixed(2)}
                  </p>
                  <span className="text-[10px] text-slate-500 block mt-0.5 font-mono">
                    {paymentMethods.mobile_money.count} transactions
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (5 cols): Best Sellers & Expiry Risk */}
          <div className="lg:col-span-5 space-y-6">
            {/* Top 5 Best-Selling Medicines */}
            <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-5 shadow-xl">
              <h3 className="text-sm font-bold text-white pb-3 border-b border-slate-700 mb-4">
                Top 5 Best-Selling Medicines
              </h3>

              {topMedicines.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">No sales recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {topMedicines.map((med, idx) => (
                    <div
                      key={med.id}
                      className="p-3 bg-slate-900/80 rounded-xl border border-slate-700/60 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold text-[10px]">
                          #{idx + 1}
                        </span>
                        <div className="truncate">
                          <h4 className="font-semibold text-white truncate">{med.name}</h4>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {med.unitsSold} units sold
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-mono font-bold text-emerald-400 block">
                          ${med.revenue.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          Profit: ${med.estimatedProfit.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 30-Day Expiry Risk Monitor */}
            <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-700 mb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                  Expiry Risk Monitor (30 Days)
                </h3>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                  <span className="text-[11px] text-rose-300 font-semibold block mb-1">
                    Batches at Expiry Risk
                  </span>
                  <p className="text-2xl font-bold text-rose-400 font-mono">
                    {expiryRisk.expiringBatchesCount} batches
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Units expiring within the next 30 days requiring urgent dispensing or discount
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-700/60">
                    <span className="text-[10px] text-slate-400 block">Cost Value at Risk:</span>
                    <span className="text-sm font-mono font-bold text-white">
                      ${expiryRisk.riskValueCost.toFixed(2)}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-700/60">
                    <span className="text-[10px] text-slate-400 block">Retail Value at Risk:</span>
                    <span className="text-sm font-mono font-bold text-amber-400">
                      ${expiryRisk.riskValueRetail.toFixed(2)}
                    </span>
                  </div>
                </div>

                <Link
                  to="/pharmacy/stock"
                  className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-lg transition text-center block"
                >
                  Inspect Expiring Batches in Stock →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
