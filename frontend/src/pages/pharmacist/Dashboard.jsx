import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getDashboardOverview } from '../../api/reportApi';

const PharmacistDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timeRange, setTimeRange] = useState('This Month');
  const [tasksState, setTasksState] = useState({});

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const res = await getDashboardOverview();
        if (res.success && res.overview) {
          setOverview(res.overview);
        }
      } catch (err) {
        console.error('Failed to load real dashboard overview data:', err);
        setError('Failed to fetch real-time overview from database.');
      } finally {
        setLoading(false);
      }
    };

    fetchOverview();
  }, []);

  const toggleTask = (taskId) => {
    setTasksState((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
          Fetching live pharmacy metrics from database...
        </p>
      </div>
    );
  }

  // Fallback safe objects
  const kpis = overview?.kpis || {
    totalRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
    activeBatches: 0,
    activeMedicines: 0,
    totalStockUnits: 0,
    revenueGrowth: '+0%',
    expenseGrowth: '+0%',
    profitGrowth: '+0%',
    batchGrowth: '+0%',
    medicineGrowth: '+0%',
  };

  const trendData = overview?.revenueVsExpenses || [];
  const maxTrendVal = Math.max(...trendData.flatMap((d) => [d.revenue, d.expenses]), 100);

  const workflow = overview?.workflowStatus || {
    total: 0,
    completed: 0,
    completedPct: 0,
    inProgress: 0,
    inProgressPct: 0,
    pendingReview: 0,
    pendingPct: 0,
    onHold: 0,
    onHoldPct: 0,
  };

  const inventory = overview?.inventoryOverview || {
    totalUnits: 0,
    inStock: 0,
    inStockPct: 0,
    lowStock: 0,
    lowStockPct: 0,
    outOfStock: 0,
    outOfStockPct: 0,
    onOrder: 0,
    onOrderPct: 0,
  };

  const procurement = overview?.pendingProcurement || { count: 0, totalValue: 0 };

  const batches = overview?.batchOverview || {
    total: 0,
    onTrack: 0,
    onTrackPct: 0,
    atRisk: 0,
    atRiskPct: 0,
    delayed: 0,
    delayedPct: 0,
    completed: 0,
    completedPct: 0,
  };

  const tasks = overview?.operationalTasks || [];
  const activities = overview?.recentActivities || [];
  const suppliers = overview?.topSuppliers || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto selection:bg-blue-500 selection:text-white pb-12">
      {error && (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs rounded-xl flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="font-bold text-rose-500 hover:text-rose-700">✕</button>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 1. TOP METRIC CARDS ROW (5 Cards - 100% Real DB Data)         */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Card 1: Total Revenue (Green) */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4.5 shadow-xs transition hover:shadow-sm">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-sm">
              $
            </div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Revenue
            </span>
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            ${kpis.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center gap-1">
            <span>↑ {kpis.revenueGrowth}</span>
            <span className="text-slate-400 dark:text-slate-500 font-normal">vs last month</span>
          </div>
        </div>

        {/* Card 2: Total Expenses (Amber) */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4.5 shadow-xs transition hover:shadow-sm">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-sm">
              🏷️
            </div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Expenses
            </span>
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            ${kpis.totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center gap-1">
            <span>↑ {kpis.expenseGrowth}</span>
            <span className="text-slate-400 dark:text-slate-500 font-normal">vs last month</span>
          </div>
        </div>

        {/* Card 3: Net Profit (Blue) */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4.5 shadow-xs transition hover:shadow-sm">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm">
              📄
            </div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Net Profit
            </span>
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            ${kpis.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center gap-1">
            <span>↑ {kpis.profitGrowth}</span>
            <span className="text-slate-400 dark:text-slate-500 font-normal">vs last month</span>
          </div>
        </div>

        {/* Card 4: Active Batches (Purple) */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4.5 shadow-xs transition hover:shadow-sm">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-sm">
              📦
            </div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Active Batches
            </span>
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            {kpis.activeBatches}
          </div>
          <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center gap-1">
            <span>↑ {kpis.batchGrowth}</span>
            <span className="text-slate-400 dark:text-slate-500 font-normal">vs last month</span>
          </div>
        </div>

        {/* Card 5: Active Medicines (Cyan) */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4.5 shadow-xs transition hover:shadow-sm">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold text-sm">
              💊
            </div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Active Medicines
            </span>
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            {kpis.activeMedicines}
          </div>
          <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center gap-1">
            <span>↑ {kpis.medicineGrowth}</span>
            <span className="text-slate-400 dark:text-slate-500 font-normal">vs last month</span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. REVENUE VS EXPENSES & WORKFLOW STATUS ROW                  */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Revenue vs Expenses Dual Line Chart (7 cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Revenue vs Expenses
              </h3>
              <div className="flex items-center gap-4 mt-1 text-xs">
                <span className="inline-flex items-center gap-1.5 font-medium text-blue-600 dark:text-blue-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                  Revenue
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium text-amber-500 dark:text-amber-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                  Expenses
                </span>
              </div>
            </div>

            <div className="inline-flex items-center gap-1 px-3 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300">
              <span>{timeRange}</span>
              <span className="text-slate-400 text-[10px]">▼</span>
            </div>
          </div>

          {/* SVG Line Chart mapped to real trend data */}
          <div className="relative h-56 w-full pt-4">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 500 160" preserveAspectRatio="none">
              {/* Horizontal Gridlines */}
              <line x1="0" y1="20" x2="500" y2="20" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeDasharray="3 3" />
              <line x1="0" y1="60" x2="500" y2="60" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeDasharray="3 3" />
              <line x1="0" y1="100" x2="500" y2="100" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeDasharray="3 3" />
              <line x1="0" y1="140" x2="500" y2="140" stroke="currentColor" className="text-slate-100 dark:text-slate-800" />

              {/* Dynamic Revenue line based on real DB trend */}
              {trendData.length > 0 && (
                <>
                  <polyline
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2.5"
                    points={trendData
                      .map((d, idx) => {
                        const x = (idx / (trendData.length - 1 || 1)) * 500;
                        const y = 140 - ((d.revenue || 0) / maxTrendVal) * 115;
                        return `${x},${y}`;
                      })
                      .join(' ')}
                  />
                  {trendData.map((d, idx) => {
                    const x = (idx / (trendData.length - 1 || 1)) * 500;
                    const y = 140 - ((d.revenue || 0) / maxTrendVal) * 115;
                    return (
                      <circle
                        key={`rev-${idx}`}
                        cx={x}
                        cy={y}
                        r="3.5"
                        fill="#2563eb"
                        className="ring-2 ring-white dark:ring-slate-900"
                      />
                    );
                  })}

                  {/* Dynamic Expenses line */}
                  <polyline
                    fill="none"
                    stroke="#f97316"
                    strokeWidth="2"
                    points={trendData
                      .map((d, idx) => {
                        const x = (idx / (trendData.length - 1 || 1)) * 500;
                        const y = 140 - ((d.expenses || 0) / maxTrendVal) * 115;
                        return `${x},${y}`;
                      })
                      .join(' ')}
                  />
                  {trendData.map((d, idx) => {
                    const x = (idx / (trendData.length - 1 || 1)) * 500;
                    const y = 140 - ((d.expenses || 0) / maxTrendVal) * 115;
                    return (
                      <circle
                        key={`exp-${idx}`}
                        cx={x}
                        cy={y}
                        r="3"
                        fill="#f97316"
                        className="ring-2 ring-white dark:ring-slate-900"
                      />
                    );
                  })}
                </>
              )}
            </svg>

            {/* Tooltip Highlight Pill with real DB data */}
            {trendData.length > 0 && (
              <div className="absolute top-8 right-16 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl shadow-md text-center pointer-events-none">
                <span className="block text-[10px] text-slate-400 font-medium">
                  {trendData[trendData.length - 1]?.label || 'Latest'}
                </span>
                <span className="block text-xs font-bold text-slate-900 dark:text-white">
                  ${(trendData[trendData.length - 1]?.revenue || kpis.totalRevenue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {/* X-Axis Labels */}
            <div className="flex justify-between text-[11px] text-slate-400 mt-2 font-medium px-2">
              {trendData.map((d, idx) => (
                <span key={idx}>{d.label}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Workflow Status Donut Card (5 cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Workflow Status
            </h3>
            <div className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300">
              <span>All Workflows</span>
              <span className="text-slate-400 text-[10px]">▼</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-around gap-6 my-auto py-2">
            {/* Donut graphic */}
            <div className="relative w-36 h-36 flex items-center justify-center shrink-0">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="38" stroke="currentColor" strokeWidth="14" fill="none" className="text-slate-100 dark:text-slate-800" />
                {/* Completed (Green) */}
                <circle cx="50" cy="50" r="38" stroke="#10b981" strokeWidth="14" fill="none" strokeDasharray={`${Math.max(1, (workflow.completedPct / 100) * 238)} 240`} strokeDashoffset="0" />
                {/* In Progress (Blue) */}
                <circle cx="50" cy="50" r="38" stroke="#3b82f6" strokeWidth="14" fill="none" strokeDasharray={`${Math.max(1, (workflow.inProgressPct / 100) * 238)} 240`} strokeDashoffset={`-${(workflow.completedPct / 100) * 238}`} />
                {/* Pending (Yellow) */}
                <circle cx="50" cy="50" r="38" stroke="#f59e0b" strokeWidth="14" fill="none" strokeDasharray={`${Math.max(1, (workflow.pendingPct / 100) * 238)} 240`} strokeDashoffset={`-${((workflow.completedPct + workflow.inProgressPct) / 100) * 238}`} />
                {/* On Hold (Red) */}
                <circle cx="50" cy="50" r="38" stroke="#ef4444" strokeWidth="14" fill="none" strokeDasharray={`${Math.max(1, (workflow.onHoldPct / 100) * 238)} 240`} strokeDashoffset={`-${((workflow.completedPct + workflow.inProgressPct + workflow.pendingPct) / 100) * 238}`} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[11px] text-slate-400 font-medium">Total</span>
                <span className="text-lg font-bold text-slate-900 dark:text-white leading-tight">{workflow.total}</span>
              </div>
            </div>

            {/* Legend list matching real data */}
            <div className="space-y-2.5 text-xs w-full sm:w-auto">
              <div className="flex items-center justify-between sm:justify-start gap-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-slate-600 dark:text-slate-300 font-medium">Completed</span>
                </div>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {workflow.completed} ({workflow.completedPct}%)
                </span>
              </div>
              <div className="flex items-center justify-between sm:justify-start gap-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <span className="text-slate-600 dark:text-slate-300 font-medium">In Progress</span>
                </div>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {workflow.inProgress} ({workflow.inProgressPct}%)
                </span>
              </div>
              <div className="flex items-center justify-between sm:justify-start gap-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="text-slate-600 dark:text-slate-300 font-medium">Pending Review</span>
                </div>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {workflow.pendingReview} ({workflow.pendingPct}%)
                </span>
              </div>
              <div className="flex items-center justify-between sm:justify-start gap-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <span className="text-slate-600 dark:text-slate-300 font-medium">On Hold</span>
                </div>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {workflow.onHold} ({workflow.onHoldPct}%)
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. INVENTORY OVERVIEW + PENDING PROCUREMENT + PROJECTS ROW    */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Inventory Overview (Real DB breakdown) */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Inventory Overview
            </h3>
            <span className="text-[11px] text-slate-500 font-medium">All Warehouses ▼</span>
          </div>

          <div className="flex items-center gap-5 my-2">
            <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="38" stroke="currentColor" strokeWidth="13" fill="none" className="text-slate-100 dark:text-slate-800" />
                <circle cx="50" cy="50" r="38" stroke="#10b981" strokeWidth="13" fill="none" strokeDasharray={`${Math.max(1, (inventory.inStockPct / 100) * 238)} 240`} strokeDashoffset="0" />
                <circle cx="50" cy="50" r="38" stroke="#f59e0b" strokeWidth="13" fill="none" strokeDasharray={`${Math.max(1, (inventory.lowStockPct / 100) * 238)} 240`} strokeDashoffset={`-${(inventory.inStockPct / 100) * 238}`} />
                <circle cx="50" cy="50" r="38" stroke="#ef4444" strokeWidth="13" fill="none" strokeDasharray={`${Math.max(1, (inventory.outOfStockPct / 100) * 238)} 240`} strokeDashoffset={`-${((inventory.inStockPct + inventory.lowStockPct) / 100) * 238}`} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[9px] text-slate-400 uppercase">Total Items</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                  {inventory.totalUnits.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="space-y-1.5 text-[11px] flex-1">
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> In Stock
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">{inventory.inStock} ({inventory.inStockPct}%)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-amber-500" /> Low Stock
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">{inventory.lowStock} ({inventory.lowStockPct}%)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-rose-500" /> Out of Stock
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">{inventory.outOfStock} ({inventory.outOfStockPct}%)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-blue-500" /> On Order
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">{inventory.onOrder} ({inventory.onOrderPct}%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Pending Procurement (Real PO DB data) */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Pending Procurement
            </h3>
          </div>

          <div className="flex items-center gap-4 my-2">
            <div className="w-12 h-12 rounded-xl bg-blue-500 text-white flex items-center justify-center font-bold text-xl shadow-md shadow-blue-500/25 shrink-0">
              🛒
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {procurement.count}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Purchase Orders Active
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 font-medium block">Total Value</span>
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                ${procurement.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <button
              onClick={() => navigate('/pharmacy/procurement')}
              className="px-3.5 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-800/60 rounded-xl transition cursor-pointer"
            >
              View All POs
            </button>
          </div>
        </div>

        {/* Card 3: Batch Lifecycle & Expiry Risk (Real FEFO DB data) */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Batch Lifecycle (FEFO)
            </h3>
            <span className="text-[11px] text-slate-500 font-medium">Active Lots ▼</span>
          </div>

          <div className="flex items-center gap-5 my-2">
            <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="38" stroke="currentColor" strokeWidth="13" fill="none" className="text-slate-100 dark:text-slate-800" />
                <circle cx="50" cy="50" r="38" stroke="#10b981" strokeWidth="13" fill="none" strokeDasharray={`${Math.max(1, (batches.onTrackPct / 100) * 238)} 240`} strokeDashoffset="0" />
                <circle cx="50" cy="50" r="38" stroke="#f59e0b" strokeWidth="13" fill="none" strokeDasharray={`${Math.max(1, (batches.atRiskPct / 100) * 238)} 240`} strokeDashoffset={`-${(batches.onTrackPct / 100) * 238}`} />
                <circle cx="50" cy="50" r="38" stroke="#ef4444" strokeWidth="13" fill="none" strokeDasharray={`${Math.max(1, (batches.delayedPct / 100) * 238)} 240`} strokeDashoffset={`-${((batches.onTrackPct + batches.atRiskPct) / 100) * 238}`} />
                <circle cx="50" cy="50" r="38" stroke="#3b82f6" strokeWidth="13" fill="none" strokeDasharray={`${Math.max(1, (batches.completedPct / 100) * 238)} 240`} strokeDashoffset={`-${((batches.onTrackPct + batches.atRiskPct + batches.delayedPct) / 100) * 238}`} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[9px] text-slate-400 uppercase">Total Lots</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{batches.total}</span>
              </div>
            </div>

            <div className="space-y-1.5 text-[11px] flex-1">
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Healthy (&gt;60d)
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">{batches.onTrack} ({batches.onTrackPct}%)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-amber-500" /> At Risk (30-60d)
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">{batches.atRisk} ({batches.atRiskPct}%)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-rose-500" /> Critical (&lt;30d)
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">{batches.delayed} ({batches.delayedPct}%)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-blue-500" /> Depleted
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">{batches.completed} ({batches.completedPct}%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4. TEAM TASKS & RECENT ACTIVITIES ROW (Real DB events)        */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Team Tasks (Real dynamic alerts directly from DB records) */}
        <div className="lg:col-span-6 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800/80">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Operational Tasks & Alerts
            </h3>
            <span className="text-xs text-slate-500 font-medium cursor-pointer">
              Active Items ({tasks.length}) ▼
            </span>
          </div>

          <div className="space-y-3">
            {tasks.map((task) => {
              const isChecked = tasksState[task.id] !== undefined ? tasksState[task.id] : task.checked;
              return (
                <div key={task.id} className="flex items-center justify-between text-xs py-1.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 rounded-lg px-2 transition">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleTask(task.id)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                    />
                    <div>
                      <p className={`font-semibold text-slate-800 dark:text-slate-200 ${isChecked ? 'line-through text-slate-400 dark:text-slate-500' : ''}`}>
                        {task.title}
                      </p>
                      <span className="text-[10px] text-slate-400">{task.dept}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[11px] text-slate-400 font-medium">{task.date}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        task.priority === 'High'
                          ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50'
                          : task.priority === 'Medium'
                          ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50'
                          : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50'
                      }`}
                    >
                      {task.priority}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Recent Activities (Real Combined Event Stream) */}
        <div className="lg:col-span-6 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800/80">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Recent Activities
            </h3>
            <Link to="/pharmacy/sales" className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
              View All
            </Link>
          </div>

          <div className="space-y-3.5">
            {activities.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                No recent activity recorded yet.
              </div>
            ) : (
              activities.map((act, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${act.color}`}>
                      {act.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">{act.title}</p>
                      <span className="text-[10px] text-slate-400 truncate block">{act.author}</span>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0 font-medium ml-2">{act.time}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 5. TOP SUPPLIERS TABLE ROW (Real Suppliers from MongoDB)       */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800/80">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Top Suppliers Directory
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Active pharmaceutical distributors and aggregated procurement spend
            </p>
          </div>
          <div className="inline-flex items-center gap-1 px-3 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300">
            <span>This Month</span>
            <span className="text-slate-400 text-[10px]">▼</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          {suppliers.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No suppliers registered. Add suppliers in the Suppliers Directory to track vendor spend.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800 text-slate-400">
                  <th className="pb-3 font-semibold">Supplier</th>
                  <th className="pb-3 font-semibold">Category / Contact</th>
                  <th className="pb-3 font-semibold">Total Spend</th>
                  <th className="pb-3 font-semibold">Orders Placed</th>
                  <th className="pb-3 font-semibold text-right">Performance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {suppliers.map((sup, i) => (
                  <tr key={sup.id || i} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3.5 font-bold text-slate-800 dark:text-slate-200">
                      {sup.name}
                    </td>
                    <td className="py-3.5 text-slate-500 dark:text-slate-400">
                      {sup.cat}
                    </td>
                    <td className="py-3.5 text-slate-900 dark:text-white font-bold">
                      ${Number(sup.spend).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 text-slate-600 dark:text-slate-300">
                      {sup.orders} orders
                    </td>
                    <td className="py-3.5 text-right text-amber-500 font-bold">
                      {sup.rating}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default PharmacistDashboard;
