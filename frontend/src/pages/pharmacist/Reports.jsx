import { useCallback, useEffect, useMemo, useState } from 'react';
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
  FileDown,
  FileSpreadsheet,
  Users,
  Archive,
  CalendarX,
  Landmark,
  GitCompare,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  getFinancialAnalytics,
  getProfitReport,
  getSalesByStaff,
  getSalesByShift,
  getSlowMovingStock,
  getExpiryLoss,
  getTaxSummary,
  getPeriodComparison,
} from '../../api/reportApi';
import { downloadExport } from '../../api/exportApi';
import { useAuth } from '../../context/AuthContext';
import MetricCard from '../../components/common/MetricCard';
import StatusBadge from '../../components/common/StatusBadge';
import { MetricCardSkeleton, CardSkeleton } from '../../components/common/SkeletonLoader';
import { formatMoney, formatDate, formatDateTime } from '../../utils/format';
import { exportCSV, exportPDF } from '../../utils/export';

const PAYMENT_META = {
  cash: { label: 'Cash', color: '#10b981', icon: Banknote },
  card: { label: 'Card', color: '#6366f1', icon: CreditCard },
  mobile_money: { label: 'Mobile money', color: '#06b6d4', icon: Smartphone },
  credit: { label: 'Credit (on account)', color: '#f59e0b', icon: Wallet },
};

const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'profit', label: 'Profit', icon: Percent },
  { id: 'staff', label: 'Staff & Shifts', icon: Users },
  { id: 'slow', label: 'Slow / Dead Stock', icon: Archive },
  { id: 'expiry', label: 'Expiry Loss', icon: CalendarX },
  { id: 'tax', label: 'Tax / VAT', icon: Landmark },
  { id: 'compare', label: 'Comparison', icon: GitCompare },
];

const RANGE_OPTIONS = [
  { id: '7d', label: '7 Days' },
  { id: 'monthly', label: '30 Days' },
  { id: 'yearly', label: 'Year' },
  { id: 'custom', label: 'Custom' },
];

const EXPORT_ENTITIES = [
  { id: 'sales', label: 'Sales (with items)' },
  { id: 'medicines', label: 'Medicines' },
  { id: 'stock', label: 'Stock batches' },
  { id: 'purchase-orders', label: 'Purchase orders' },
  { id: 'customers', label: 'Customers' },
];

const card = 'bg-white dark:bg-[#161c26] rounded-2xl border border-slate-100/90 dark:border-slate-800/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5 sm:p-6';
const btn =
  'inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-xs font-semibold rounded-xl shadow-2xs transition cursor-pointer disabled:opacity-50';
const th = 'pb-3 text-[11px] uppercase tracking-wider font-semibold text-slate-400';
const money = (v) => formatMoney(v);
const pct = (v) => (v === null || v === undefined ? 'n/a' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)}%`);
const todayIso = () => new Date().toISOString().slice(0, 10);
const daysAgoIso = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

// Small data-loading hook: re-runs when `key` changes.
const useReport = (fetcher, key) => {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const data = await fetcher();
      setState({ data, loading: false, error: '' });
    } catch (err) {
      setState({ data: null, loading: false, error: err.response?.data?.message || 'Failed to load this report.' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    run();
  }, [run]);
  return { ...state, reload: run };
};

const CardTitle = ({ icon: Icon, title, subtitle, tone = 'emerald', right }) => {
  const tones = {
    emerald: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/80 dark:border-emerald-800/60 text-emerald-600 dark:text-emerald-400',
    indigo: 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200/80 dark:border-indigo-800/60 text-indigo-600 dark:text-indigo-400',
    amber: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200/80 dark:border-amber-800/60 text-amber-600 dark:text-amber-400',
    rose: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200/80 dark:border-rose-800/60 text-rose-600 dark:text-rose-400',
  };
  return (
    <div className="flex items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-100 dark:border-slate-800/80">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${tones[tone]}`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
};

const Stat = ({ label, value, sub, tone = 'slate' }) => {
  const tones = {
    slate: 'text-slate-900 dark:text-white',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    rose: 'text-rose-600 dark:text-rose-400',
    amber: 'text-amber-600 dark:text-amber-400',
  };
  return (
    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">{label}</p>
      <p className={`mt-1 font-mono font-bold text-lg ${tones[tone]}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
};

const Empty = ({ children }) => <div className="py-12 text-center text-xs text-slate-400">{children}</div>;

const ErrorBox = ({ message, onRetry }) => (
  <div className="p-8 bg-white dark:bg-[#161c26] rounded-2xl border border-rose-200 dark:border-rose-900/50 text-center space-y-3 max-w-2xl mx-auto">
    <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
      <AlertTriangle className="w-6 h-6" />
    </div>
    <p className="text-xs text-slate-500 dark:text-slate-400">{message}</p>
    <button onClick={onRetry} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl cursor-pointer">
      Retry
    </button>
  </div>
);

const Loading = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCardSkeleton />
      <MetricCardSkeleton />
      <MetricCardSkeleton />
      <MetricCardSkeleton />
    </div>
    <CardSkeleton height="h-80" />
  </div>
);

// Generic table used by every tab: columns [{ key, header, align, render?, format? }]
const DataTableSimple = ({ columns, rows, empty = 'No data for this period.' }) =>
  rows.length === 0 ? (
    <Empty>{empty}</Empty>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-100 dark:border-slate-800">
            {columns.map((c) => (
              <th key={c.header} className={`${th} ${c.align === 'right' ? 'text-right' : ''}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100/80 dark:divide-slate-800/60 font-medium">
          {rows.map((row, i) => (
            <tr key={row.id || row._id || i} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
              {columns.map((c) => (
                <td
                  key={c.header}
                  className={`py-2.5 pr-2 text-slate-700 dark:text-slate-300 ${c.align === 'right' ? 'text-right font-mono' : ''}`}
                >
                  {c.render ? c.render(row) : c.format ? c.format(row[c.key], row) : row[c.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white dark:bg-slate-900 text-xs p-3 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800">
      <div className="font-semibold text-slate-600 dark:text-slate-300 mb-1">
        {label} {d?.date && <span className="font-mono text-[10px] text-slate-400 ml-2">{d.date}</span>}
      </div>
      <p className="font-mono text-emerald-600 dark:text-emerald-400 font-bold text-sm">{money(payload[0].value)}</p>
      {d?.orderCount !== undefined && <p className="text-[11px] text-slate-500">{d.orderCount} orders</p>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tabs. Each one reports its export spec ({ title, columns, rows, summary }) via onExportSpec.
// ---------------------------------------------------------------------------

const OverviewTab = ({ range, rangeKey, onExportSpec }) => {
  const { data, loading, error, reload } = useReport(() => getFinancialAnalytics(range), rangeKey);
  const analytics = data?.analytics;

  useEffect(() => {
    if (!analytics) return;
    const f = analytics.financials;
    onExportSpec({
      title: 'Financial Overview',
      columns: [
        { key: 'name', header: 'Medicine' },
        { key: 'unitsSold', header: 'Units sold', align: 'right' },
        { key: 'revenue', header: 'Net revenue', align: 'right', format: money },
        { key: 'cogs', header: 'COGS', align: 'right', format: money },
        { key: 'estimatedProfit', header: 'Profit', align: 'right', format: money },
      ],
      rows: analytics.topMedicines,
      summary: [
        ['Revenue (net of refunds)', money(f.totalRevenue)],
        ['Refunds', money(f.refunds)],
        ['Tax collected', money(f.taxTotal)],
        ['Cost of goods sold', money(f.totalCOGS)],
        ['Gross profit', `${money(f.grossProfit)} (${f.profitMargin}%)`],
        ['Orders', f.totalOrders],
        ...Object.entries(analytics.paymentMethods).map(([k, v]) => [`Paid by ${PAYMENT_META[k]?.label || k}`, `${money(v.total)} (${v.count})`]),
      ],
    });
  }, [analytics, onExportSpec]);

  if (loading && !analytics) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!analytics) return null;

  const { financials, paymentMethods, dailyTrend, topMedicines, expiryRisk, comparison } = analytics;
  const series = dailyTrend.map((d) => d.revenue);
  const change = (k, invert = false) => {
    const v = comparison?.[k]?.changePct;
    if (v === null || v === undefined) return { change: 'n/a', changeType: 'neutral' };
    const good = invert ? v <= 0 : v >= 0;
    return { change: pct(v), changeType: good ? 'positive' : 'negative' };
  };
  const paymentRows = Object.entries(paymentMethods).map(([k, v]) => ({
    key: k,
    ...(PAYMENT_META[k] || { label: k.replace(/_/g, ' '), color: '#94a3b8', icon: Wallet }),
    ...v,
  }));
  const pieData = paymentRows.filter((p) => p.total > 0);
  const tenderTotal = paymentRows.reduce((s, p) => s + p.total, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <MetricCard
          title="Revenue"
          value={money(financials.totalRevenue)}
          {...change('revenue')}
          subValue={`${analytics.rangeLabel} · refunds ${money(financials.refunds)}`}
          badgeText="Inflow"
          badgeVariant="emerald"
          icon={<DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
          sparklineData={series}
          sparklineColor="#10b981"
          sparklineId="rep-rev-spark"
        />
        <MetricCard
          title="Cost of Goods (COGS)"
          value={money(financials.totalCOGS)}
          {...change('cogs', true)}
          subValue="Actual batch costs of units sold"
          badgeText="Cost"
          badgeVariant="amber"
          icon={<Layers className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
          sparklineData={series}
          sparklineColor="#f59e0b"
          sparklineId="rep-cogs-spark"
        />
        <MetricCard
          title="Gross Profit"
          value={money(financials.grossProfit)}
          {...change('grossProfit')}
          subValue={`${Number(financials.profitMargin || 0).toFixed(1)}% margin on net sales (excl. tax)`}
          badgeText={financials.grossProfit >= 0 ? 'Profit' : 'Loss'}
          badgeVariant={financials.grossProfit >= 0 ? 'emerald' : 'rose'}
          icon={<Percent className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
          sparklineData={series}
          sparklineColor="#10b981"
          sparklineId="rep-margin-spark"
        />
        <MetricCard
          title="Sales Transactions"
          value={String(financials.totalOrders || 0)}
          {...change('orders')}
          subValue={`Avg ticket ${money(financials.avgTicket)}`}
          badgeText="Volume"
          badgeVariant="indigo"
          icon={<Receipt className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
          sparklineData={dailyTrend.map((d) => d.orderCount)}
          sparklineColor="#6366f1"
          sparklineId="rep-trans-spark"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className={`lg:col-span-8 ${card}`}>
          <CardTitle icon={BarChart3} title={`Sales Velocity (${analytics.rangeLabel})`} subtitle="Gross receipts per day (voided sales excluded)" />
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.15} />
                <XAxis dataKey="dayName" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} minTickGap={12} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={60} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2.5} fill="url(#revenueFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={`lg:col-span-4 ${card}`}>
          <CardTitle icon={PieIcon} tone="indigo" title="Tender Distribution" subtitle="Split payments counted per method" />
          <div className="h-44 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData.length ? pieData : [{ label: 'None', total: 1, color: '#e2e8f0' }]}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={4}
                  dataKey="total"
                >
                  {(pieData.length ? pieData : [{ color: '#e2e8f0' }]).map((p, i) => (
                    <Cell key={i} fill={p.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] uppercase font-bold text-slate-400">Total Tender</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">{money(tenderTotal)}</span>
            </div>
          </div>
          <div className="space-y-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs">
            {paymentRows.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5" style={{ color: p.color }} />
                    <span className="text-slate-700 dark:text-slate-300">{p.label}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-slate-400 text-[11px]">{p.count}tx</span>
                    <span className="font-bold text-slate-900 dark:text-white">{money(p.total)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className={`lg:col-span-7 ${card}`}>
          <CardTitle icon={Award} tone="amber" title={`Top Medicines (${analytics.rangeLabel})`} subtitle="Ranked by net revenue, after returns" />
          <DataTableSimple
            rows={topMedicines}
            empty="No recorded product sales in this period."
            columns={[
              { header: '#', render: (r) => topMedicines.indexOf(r) + 1 },
              { header: 'Medicine', key: 'name' },
              { header: 'Units', key: 'unitsSold', align: 'right' },
              { header: 'Revenue', key: 'revenue', align: 'right', format: money },
              {
                header: 'Profit',
                align: 'right',
                render: (r) => (
                  <span className={r.estimatedProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-rose-600 font-bold'}>
                    {money(r.estimatedProfit)}
                  </span>
                ),
              },
            ]}
          />
        </div>

        <div className={`lg:col-span-5 ${card}`}>
          <CardTitle
            icon={ShieldAlert}
            tone={expiryRisk.expiringBatchesCount > 0 ? 'rose' : 'emerald'}
            title="Expiry Risk"
            subtitle="Batches expiring within the next 30 days"
            right={
              <StatusBadge
                status={expiryRisk.expiringBatchesCount > 0 ? 'critical' : 'healthy'}
                label={expiryRisk.expiringBatchesCount > 0 ? 'Warning' : 'Compliant'}
              />
            }
          />
          <div className="space-y-3">
            <Stat label="At-risk batches" value={expiryRisk.expiringBatchesCount} />
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Value at cost" value={money(expiryRisk.riskValueCost)} tone="amber" />
              <Stat label="Value at retail" value={money(expiryRisk.riskValueRetail)} tone="rose" />
            </div>
            <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-xl border border-emerald-200/80 dark:border-emerald-900/40 text-xs text-emerald-800 dark:text-emerald-300">
              <p className="font-bold flex items-center gap-1.5 mb-1">
                <Clock className="w-3.5 h-3.5" /> FEFO protection
              </p>
              <p className="text-[11px] leading-relaxed">The POS sells the earliest-expiring batch first to reduce write-offs.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ProfitTab = ({ range, rangeKey, onExportSpec }) => {
  const [groupBy, setGroupBy] = useState('medicine');
  const { data, loading, error, reload } = useReport(() => getProfitReport(range, groupBy), `${rangeKey}|${groupBy}`);
  const report = data?.report;

  const columns = useMemo(
    () => [
      { key: 'name', header: groupBy === 'category' ? 'Category' : 'Medicine' },
      ...(groupBy === 'medicine' ? [{ key: 'category', header: 'Category' }] : [{ key: 'medicines', header: 'Medicines', align: 'right' }]),
      { key: 'unitsSold', header: 'Units (net)', align: 'right' },
      { key: 'revenue', header: 'Net revenue', align: 'right', format: money },
      { key: 'cogs', header: 'COGS', align: 'right', format: money },
      { key: 'profit', header: 'Profit', align: 'right', format: money },
      { key: 'marginPct', header: 'Margin', align: 'right', format: (v) => `${v}%` },
    ],
    [groupBy]
  );

  useEffect(() => {
    if (!report) return;
    onExportSpec({
      title: `Profit by ${groupBy}`,
      columns,
      rows: report.rows,
      summary: [
        ['Net revenue', money(report.totals.revenue)],
        ['COGS', money(report.totals.cogs)],
        ['Profit', `${money(report.totals.profit)} (${report.totals.marginPct}%)`],
      ],
    });
  }, [report, columns, groupBy, onExportSpec]);

  if (loading && !report) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!report) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Stat label="Net revenue" value={money(report.totals.revenue)} />
        <Stat label="Cost of goods" value={money(report.totals.cogs)} tone="amber" />
        <Stat label="Gross profit" value={money(report.totals.profit)} tone={report.totals.profit >= 0 ? 'emerald' : 'rose'} />
        <Stat label="Margin" value={`${report.totals.marginPct}%`} sub={`${report.totals.unitsSold} units sold`} />
      </div>
      <div className={card}>
        <CardTitle
          icon={Percent}
          title={`Profit by ${groupBy}`}
          subtitle="Uses the actual cost recorded per sold unit (batch purchase price), net of returns and discounts, excluding tax"
          right={
            <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-[11px]">
              {['medicine', 'category'].map((g) => (
                <button
                  key={g}
                  onClick={() => setGroupBy(g)}
                  className={`px-3 py-1.5 rounded-lg capitalize cursor-pointer ${
                    groupBy === g ? 'bg-white dark:bg-[#161c26] text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          }
        />
        {report.rows.length > 0 && (
          <div className="h-64 w-full mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.rows.slice(0, 10)} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.15} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} interval={0} tickFormatter={(v) => String(v).slice(0, 12)} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={60} />
                <Tooltip formatter={(v) => money(v)} />
                <Bar dataKey="revenue" name="Revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="profit" name="Profit" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <DataTableSimple columns={columns} rows={report.rows} />
      </div>
    </div>
  );
};

const STAFF_COLUMNS = [
  { key: 'name', header: 'Staff member' },
  { key: 'orders', header: 'Sales', align: 'right' },
  { key: 'revenue', header: 'Revenue', align: 'right', format: money },
  { key: 'refunds', header: 'Refunds', align: 'right', format: money },
  { key: 'netRevenue', header: 'Net', align: 'right', format: money },
  { key: 'discount', header: 'Discounts', align: 'right', format: money },
  { key: 'avgTicket', header: 'Avg ticket', align: 'right', format: money },
];

const SHIFT_COLUMNS = [
  { key: 'label', header: 'Shift' },
  { key: 'staff', header: 'Staff', format: (v) => (v || []).join(', ') },
  { key: 'openedAt', header: 'Opened', format: (v) => formatDateTime(v) },
  { key: 'closedAt', header: 'Closed', format: (v) => (v ? formatDateTime(v) : '—') },
  { key: 'orders', header: 'Sales', align: 'right' },
  { key: 'netRevenue', header: 'Net revenue', align: 'right', format: money },
  { key: 'variance', header: 'Cash variance', align: 'right', format: (v) => (v === null || v === undefined ? '—' : money(v)) },
];

const StaffTab = ({ range, rangeKey, onExportSpec }) => {
  const staff = useReport(() => getSalesByStaff(range), rangeKey);
  const shifts = useReport(() => getSalesByShift(range), rangeKey);

  useEffect(() => {
    if (!staff.data) return;
    onExportSpec({ title: 'Sales by Staff', columns: STAFF_COLUMNS, rows: staff.data.report.rows });
  }, [staff.data, onExportSpec]);

  if (staff.loading && !staff.data) return <Loading />;
  if (staff.error) return <ErrorBox message={staff.error} onRetry={staff.reload} />;

  return (
    <div className="space-y-6">
      <div className={card}>
        <CardTitle icon={Users} title="Sales by Staff" subtitle="Grouped by the staff member who made the sale; refunds attributed to the original seller" />
        <DataTableSimple columns={STAFF_COLUMNS} rows={staff.data?.report.rows || []} />
      </div>
      <div className={card}>
        <CardTitle
          icon={Clock}
          tone="indigo"
          title="Sales by Shift"
          subtitle="Cash-register shifts; sales made outside a shift are grouped as “No shift”"
          right={
            shifts.data?.report.rows?.length ? (
              <button className={btn} onClick={() => exportCSV(shifts.data.report.rows, SHIFT_COLUMNS, 'sales-by-shift')}>
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
            ) : null
          }
        />
        {shifts.error ? (
          <Empty>{shifts.error}</Empty>
        ) : (
          <DataTableSimple columns={SHIFT_COLUMNS} rows={shifts.data?.report.rows || []} />
        )}
      </div>
    </div>
  );
};

const SlowTab = ({ onExportSpec }) => {
  const [days, setDays] = useState(90);
  const [status, setStatus] = useState('all');
  const { data, loading, error, reload } = useReport(() => getSlowMovingStock(days, status), `${days}|${status}`);
  const report = data?.report;

  const columns = useMemo(
    () => [
      { key: 'name', header: 'Medicine' },
      { key: 'category', header: 'Category' },
      { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status === 'dead' ? 'critical' : 'warning'} label={r.status === 'dead' ? 'Dead' : 'Slow'} size="sm" />, format: (v) => v },
      { key: 'quantity', header: 'In stock', align: 'right' },
      { key: 'stockValue', header: 'Stock value', align: 'right', format: money },
      { key: 'unitsSoldInWindow', header: `Sold (${days}d)`, align: 'right' },
      { key: 'daysSinceLastSale', header: 'Days since sale', align: 'right', format: (v) => (v === null ? 'Never' : v) },
      { key: 'nearestExpiry', header: 'Nearest expiry', format: (v) => formatDate(v) },
    ],
    [days]
  );

  useEffect(() => {
    if (!report) return;
    onExportSpec({
      title: `Slow-moving & dead stock (${days} days)`,
      columns: columns.map(({ render, ...c }) => c), // eslint-disable-line no-unused-vars
      rows: report.rows,
      summary: [
        ['Dead stock', `${report.summary.dead.count} items · ${money(report.summary.dead.stockValue)}`],
        ['Slow movers', `${report.summary.slow.count} items · ${money(report.summary.slow.stockValue)}`],
      ],
    });
  }, [report, columns, days, onExportSpec]);

  return (
    <div className="space-y-6">
      <div className={card}>
        <CardTitle
          icon={Archive}
          tone="amber"
          title="Slow-moving & Dead Stock"
          subtitle="Dead: no sales in the window. Slow: current stock would last more than 3x the window at the recent sales rate."
          right={
            <div className="flex items-center gap-2 text-xs">
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                {[30, 60, 90, 180, 365].map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </select>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                <option value="all">Dead + slow</option>
                <option value="dead">Dead only</option>
                <option value="slow">Slow only</option>
              </select>
            </div>
          }
        />
        {loading && !report ? (
          <CardSkeleton height="h-64" />
        ) : error ? (
          <ErrorBox message={error} onRetry={reload} />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <Stat label="Dead stock" value={money(report.summary.dead.stockValue)} sub={`${report.summary.dead.count} medicines tied up`} tone="rose" />
              <Stat label="Slow movers" value={money(report.summary.slow.stockValue)} sub={`${report.summary.slow.count} medicines`} tone="amber" />
            </div>
            <DataTableSimple columns={columns} rows={report.rows} empty="Nothing slow or dead: all stocked medicines are selling." />
          </>
        )}
      </div>
    </div>
  );
};

const ExpiryTab = ({ range, rangeKey, onExportSpec }) => {
  const { data, loading, error, reload } = useReport(() => getExpiryLoss(range), rangeKey);
  const report = data?.report;

  useEffect(() => {
    if (!report) return;
    onExportSpec({
      title: 'Expiry Loss',
      columns: [
        { key: 'month', header: 'Month' },
        { key: 'batches', header: 'Batches', align: 'right' },
        { key: 'units', header: 'Units', align: 'right' },
        { key: 'value', header: 'Loss at cost', align: 'right', format: money },
      ],
      rows: report.byMonth,
      summary: [
        ['Total written off', money(report.totals.value)],
        ['Expired, still on shelf', `${money(report.expiredOnShelf.value)} (${report.expiredOnShelf.batches} batches)`],
      ],
    });
  }, [report, onExportSpec]);

  if (loading && !report) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!report) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Written off (at cost)" value={money(report.totals.value)} sub={`${report.totals.units} units · ${report.totals.batches} batches`} tone="rose" />
        <Stat label="Expired, not written off" value={money(report.expiredOnShelf.value)} sub={`${report.expiredOnShelf.units} units in ${report.expiredOnShelf.batches} batches`} tone="amber" />
        <Stat label="Period" value={report.rangeLabel} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className={`lg:col-span-7 ${card}`}>
          <CardTitle icon={CalendarX} tone="rose" title="Expiry loss by month" subtitle="Stock written off as expired (movements of type expire / adjust expired)" />
          {report.byMonth.length === 0 ? (
            <Empty>No expired stock was written off in this period.</Empty>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.byMonth}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.15} />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={60} />
                  <Tooltip formatter={(v) => money(v)} />
                  <Bar dataKey="value" name="Loss" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className={`lg:col-span-5 ${card}`}>
          <CardTitle icon={ShieldAlert} tone="amber" title="Biggest losses" subtitle="By medicine" />
          <DataTableSimple
            rows={report.byMedicine}
            empty="No losses recorded."
            columns={[
              { key: 'name', header: 'Medicine' },
              { key: 'units', header: 'Units', align: 'right' },
              { key: 'value', header: 'Loss', align: 'right', format: money },
            ]}
          />
        </div>
      </div>
    </div>
  );
};

const TaxTab = ({ range, rangeKey, onExportSpec }) => {
  const { data, loading, error, reload } = useReport(() => getTaxSummary(range), rangeKey);
  const report = data?.report;

  const columns = useMemo(
    () => [
      { key: 'period', header: report?.groupBy === 'month' ? 'Month' : 'Day' },
      { key: 'sales', header: 'Sales', align: 'right' },
      { key: 'grossSales', header: 'Gross sales', align: 'right', format: money },
      { key: 'taxableSales', header: 'Taxable (net)', align: 'right', format: money },
      { key: 'lines', header: 'Breakdown', format: (v) => (v || []).map((l) => `${l.name} ${l.rate}%: ${money(l.amount)}`).join('; ') || '—' },
      { key: 'tax', header: 'Tax', align: 'right', format: money },
    ],
    [report?.groupBy]
  );

  useEffect(() => {
    if (!report) return;
    onExportSpec({
      title: 'Tax / VAT Summary',
      columns,
      rows: report.periods,
      summary: [
        ['Total tax', money(report.totals.tax)],
        ['Taxable sales', money(report.totals.taxableSales)],
        ...report.byRate.map((r) => [`${r.name} ${r.rate}%`, money(r.amount)]),
      ],
    });
  }, [report, columns, onExportSpec]);

  if (loading && !report) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!report) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Tax collected" value={money(report.totals.tax)} tone="emerald" />
        <Stat label="Taxable sales (net)" value={money(report.totals.taxableSales)} />
        <Stat label="Gross sales" value={money(report.totals.grossSales)} sub={report.totals.untrackedTax > 0 ? `${money(report.totals.untrackedTax)} entered manually` : null} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className={`lg:col-span-4 ${card}`}>
          <CardTitle icon={Landmark} tone="indigo" title="By tax rate" />
          <DataTableSimple
            rows={report.byRate}
            empty="No itemized tax in this period."
            columns={[
              { key: 'name', header: 'Tax' },
              { key: 'rate', header: 'Rate', align: 'right', format: (v) => `${v}%` },
              { key: 'sales', header: 'Sales', align: 'right' },
              { key: 'amount', header: 'Amount', align: 'right', format: money },
            ]}
          />
        </div>
        <div className={`lg:col-span-8 ${card}`}>
          <CardTitle icon={Receipt} title={`Per ${report.groupBy}`} subtitle="From the tax lines stored on each sale (voided sales excluded)" />
          <DataTableSimple columns={columns} rows={report.periods} />
        </div>
      </div>
    </div>
  );
};

const COMPARE_LABELS = {
  revenue: ['Revenue (net of refunds)', true],
  netRevenue: ['Net revenue (excl. tax)', true],
  grossProfit: ['Gross profit', true],
  cogs: ['Cost of goods sold', true],
  orders: ['Orders', false],
  avgTicket: ['Average ticket', true],
  tax: ['Tax collected', true],
  refunds: ['Refunds', true],
  unitsSold: ['Units sold', false],
};
const GOOD_WHEN_DOWN = new Set(['cogs', 'refunds']);

const CompareTab = ({ range, rangeKey, onExportSpec }) => {
  const { data, loading, error, reload } = useReport(() => getPeriodComparison(range), rangeKey);
  const report = data?.report;
  const rows = useMemo(
    () =>
      report
        ? Object.entries(report.comparison).map(([key, v]) => ({
            id: key,
            metric: COMPARE_LABELS[key]?.[0] || key,
            isMoney: COMPARE_LABELS[key]?.[1],
            ...v,
          }))
        : [],
    [report]
  );

  useEffect(() => {
    if (!report) return;
    const fmt = (v, r) => (r.isMoney ? money(v) : v);
    onExportSpec({
      title: 'Period Comparison',
      columns: [
        { key: 'metric', header: 'Metric' },
        { key: 'current', header: 'This period', align: 'right', format: fmt },
        { key: 'previous', header: 'Previous period', align: 'right', format: fmt },
        { key: 'changePct', header: 'Change', align: 'right', format: pct },
      ],
      rows,
      summary: [
        ['This period', `${formatDate(report.from)} - ${formatDate(new Date(new Date(report.to).getTime() - 1))}`],
        ['Previous period', `${formatDate(report.previous?.from)} - ${formatDate(new Date(new Date(report.previous?.to).getTime() - 1))}`],
      ],
    });
  }, [report, rows, onExportSpec]);

  if (range.range === 'all') return <Empty>Choose a bounded period to compare.</Empty>;
  if (loading && !report) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!report) return null;

  return (
    <div className={card}>
      <CardTitle
        icon={GitCompare}
        tone="indigo"
        title={`${report.rangeLabel} vs previous period`}
        subtitle={`${formatDate(report.from)} – ${formatDate(new Date(new Date(report.to).getTime() - 1))} compared with ${formatDate(report.previous?.from)} – ${formatDate(new Date(new Date(report.previous?.to).getTime() - 1))}`}
      />
      <DataTableSimple
        rows={rows}
        columns={[
          { key: 'metric', header: 'Metric' },
          { key: 'current', header: 'This period', align: 'right', render: (r) => (r.isMoney ? money(r.current) : r.current) },
          { key: 'previous', header: 'Previous', align: 'right', render: (r) => (r.isMoney ? money(r.previous) : r.previous) },
          {
            key: 'changePct',
            header: 'Change',
            align: 'right',
            render: (r) => {
              if (r.changePct === null || r.changePct === undefined) return <span className="text-slate-400">n/a</span>;
              const up = r.changePct >= 0;
              const good = GOOD_WHEN_DOWN.has(r.id) ? !up : up;
              const Icon = up ? ArrowUpRight : ArrowDownRight;
              return (
                <span className={`inline-flex items-center gap-0.5 font-bold ${good ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  <Icon className="w-3.5 h-3.5" />
                  {pct(r.changePct)}
                </span>
              );
            },
          },
        ]}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------

const Reports = () => {
  const { can, activePharmacy, user } = useAuth();
  const [tab, setTab] = useState('overview');
  const [rangeId, setRangeId] = useState('7d');
  const [customFrom, setCustomFrom] = useState(daysAgoIso(30));
  const [customTo, setCustomTo] = useState(todayIso());
  const [exportSpec, setExportSpec] = useState(null);
  const [exporting, setExporting] = useState('');
  const [exportError, setExportError] = useState('');

  const range = useMemo(
    () => (rangeId === 'custom' ? { range: 'custom', from: customFrom, to: customTo } : { range: rangeId }),
    [rangeId, customFrom, customTo]
  );
  const rangeKey = rangeId === 'custom' ? `custom|${customFrom}|${customTo}` : rangeId;
  const customInvalid = rangeId === 'custom' && (!customFrom || !customTo || customFrom > customTo);

  const handleTab = (id) => {
    setExportSpec(null);
    setTab(id);
  };
  const onExportSpec = useCallback((spec) => setExportSpec(spec), []);

  const periodLabel = rangeId === 'custom' ? `${customFrom} to ${customTo}` : RANGE_OPTIONS.find((r) => r.id === rangeId)?.label;
  const fileBase = exportSpec ? exportSpec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'report';

  const handleCSV = () => exportSpec && exportCSV(exportSpec.rows, exportSpec.columns, fileBase);
  const handlePDF = () =>
    exportSpec &&
    exportPDF({
      title: exportSpec.title,
      columns: exportSpec.columns,
      rows: exportSpec.rows,
      filename: fileBase,
      meta: {
        pharmacy: activePharmacy?.name,
        period: tab === 'slow' ? null : periodLabel,
        generatedBy: user?.name,
        summary: exportSpec.summary,
      },
    });

  const handleDataExport = async (entity) => {
    if (!entity) return;
    setExporting(entity);
    setExportError('');
    try {
      await downloadExport(entity, { format: 'xlsx', ...(entity === 'sales' ? range : {}) });
    } catch (err) {
      let message = 'Export failed';
      const blob = err.response?.data;
      if (blob instanceof Blob) {
        try {
          message = JSON.parse(await blob.text()).message || message;
        } catch {
          // keep default
        }
      }
      setExportError(message);
    } finally {
      setExporting('');
    }
  };

  const tabProps = { range, rangeKey, onExportSpec };

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 uppercase tracking-wider">
            Executive Analytics
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">Reports</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Revenue, profit, staff performance, stock health and tax. Voided sales are excluded and returns are deducted.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {tab !== 'slow' && (
            <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-medium">
              {RANGE_OPTIONS.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRangeId(r.id)}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
                    rangeId === r.id
                      ? 'bg-white dark:bg-[#161c26] text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
          {tab !== 'slow' && rangeId === 'custom' && (
            <div className="flex items-center gap-1.5 text-xs">
              <input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} className="px-2 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300" aria-label="From date" />
              <span className="text-slate-400">to</span>
              <input type="date" value={customTo} min={customFrom} max={todayIso()} onChange={(e) => setCustomTo(e.target.value)} className="px-2 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300" aria-label="To date" />
            </div>
          )}
          <button onClick={handleCSV} disabled={!exportSpec} className={btn} title="Export this report as CSV">
            <Download className="w-4 h-4" /> CSV
          </button>
          <button onClick={handlePDF} disabled={!exportSpec} className={btn} title="Export this report as PDF">
            <FileDown className="w-4 h-4" /> PDF
          </button>
          {can('data:export') && (
            <div className="relative">
              <FileSpreadsheet className="w-4 h-4 text-slate-500 absolute left-3 top-2 pointer-events-none" />
              <select
                value=""
                disabled={Boolean(exporting)}
                onChange={(e) => handleDataExport(e.target.value)}
                className="pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
                aria-label="Export data to Excel"
              >
                <option value="">{exporting ? 'Exporting…' : 'Excel data…'}</option>
                {EXPORT_ENTITIES.map((en) => (
                  <option key={en.id} value={en.id}>
                    {en.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {exportError && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 text-xs">{exportError}</div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200/80 dark:border-slate-800 -mt-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => handleTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition cursor-pointer ${
                tab === t.id
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {customInvalid && tab !== 'slow' ? (
        <Empty>Pick a valid date range (from must be on or before to).</Empty>
      ) : (
        <>
          {tab === 'overview' && <OverviewTab {...tabProps} />}
          {tab === 'profit' && <ProfitTab {...tabProps} />}
          {tab === 'staff' && <StaffTab {...tabProps} />}
          {tab === 'slow' && <SlowTab onExportSpec={onExportSpec} />}
          {tab === 'expiry' && <ExpiryTab {...tabProps} />}
          {tab === 'tax' && <TaxTab {...tabProps} />}
          {tab === 'compare' && <CompareTab {...tabProps} />}
        </>
      )}
    </div>
  );
};

export default Reports;
