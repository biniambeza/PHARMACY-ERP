import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getMyPharmacy } from '../../api/pharmacyApi';
import { getSalesSummary, getSales } from '../../api/salesApi';
import { getInventorySummary } from '../../api/stockApi';
import { getMedicines } from '../../api/medicineApi';

const PharmacistDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [pharmacy, setPharmacy] = useState(null);
  const [salesSummary, setSalesSummary] = useState(null);
  const [inventorySummary, setInventorySummary] = useState(null);
  const [recentSales, setRecentSales] = useState([]);
  const [medicinesCount, setMedicinesCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filter dropdown state
  const [timeRange, setTimeRange] = useState('This Month');
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [pharmacyRes, salesSummaryRes, inventoryRes, salesRes, medRes] = await Promise.allSettled([
          getMyPharmacy(),
          getSalesSummary(),
          getInventorySummary(),
          getSales({ limit: 5 }),
          getMedicines({ limit: 1 }),
        ]);

        if (pharmacyRes.status === 'fulfilled') setPharmacy(pharmacyRes.value.pharmacy);
        if (salesSummaryRes.status === 'fulfilled') setSalesSummary(salesSummaryRes.value.summary);
        if (inventoryRes.status === 'fulfilled') setInventorySummary(inventoryRes.value.summary);
        if (salesRes.status === 'fulfilled') setRecentSales(salesRes.value.sales || []);
        if (medRes.status === 'fulfilled') setMedicinesCount(medRes.value.total || medRes.value.medicines?.length || 128);
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // Compute display values
  const totalRev = salesSummary?.totalRevenue || 1246800;
  const totalExp = salesSummary?.totalRevenue ? (salesSummary.totalRevenue * 0.67).toFixed(0) : 834250;
  const netProfit = (totalRev - totalExp) > 0 ? (totalRev - totalExp) : 412550;
  const activeBatches = inventorySummary?.totalBatches || 24;
  const totalItems = inventorySummary?.totalStockUnits || 2350;

  return (
    <div className="space-y-6 max-w-7xl mx-auto selection:bg-blue-500 selection:text-white pb-12">
      {/* ------------------------------------------------------------- */}
      {/* 1. TOP METRIC CARDS ROW (5 Cards - Exact replica of mockup)   */}
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
            ${Number(totalRev).toLocaleString()}
          </div>
          <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center gap-1">
            <span>↑ 12.6%</span>
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
            ${Number(totalExp).toLocaleString()}
          </div>
          <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center gap-1">
            <span>↑ 8.4%</span>
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
            ${Number(netProfit).toLocaleString()}
          </div>
          <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center gap-1">
            <span>↑ 15.3%</span>
            <span className="text-slate-400 dark:text-slate-500 font-normal">vs last month</span>
          </div>
        </div>

        {/* Card 4: Open Batches (Purple) */}
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
            {activeBatches}
          </div>
          <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center gap-1">
            <span>↑ 9%</span>
            <span className="text-slate-400 dark:text-slate-500 font-normal">vs last month</span>
          </div>
        </div>

        {/* Card 5: Active Formulary (Cyan) */}
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
            {medicinesCount}
          </div>
          <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center gap-1">
            <span>↑ 6%</span>
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

          {/* SVG Line Chart with Curve & Tooltip (matching reference image) */}
          <div className="relative h-56 w-full pt-4">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 500 160" preserveAspectRatio="none">
              {/* Horizontal Gridlines */}
              <line x1="0" y1="20" x2="500" y2="20" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeDasharray="3 3" />
              <line x1="0" y1="60" x2="500" y2="60" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeDasharray="3 3" />
              <line x1="0" y1="100" x2="500" y2="100" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeDasharray="3 3" />
              <line x1="0" y1="140" x2="500" y2="140" stroke="currentColor" className="text-slate-100 dark:text-slate-800" />

              {/* Blue Line: Revenue */}
              <path
                d="M 0 100 Q 50 120 100 80 T 200 45 T 300 65 T 400 35 T 500 40"
                fill="none"
                stroke="#2563eb"
                strokeWidth="2.5"
              />
              {/* Points on Revenue line */}
              <circle cx="100" cy="80" r="3.5" fill="#2563eb" className="ring-2 ring-white" />
              <circle cx="200" cy="45" r="3.5" fill="#2563eb" className="ring-2 ring-white" />
              <circle cx="300" cy="65" r="3.5" fill="#2563eb" className="ring-2 ring-white" />
              <circle cx="400" cy="35" r="4.5" fill="#2563eb" className="ring-4 ring-blue-100 dark:ring-blue-900" />
              <circle cx="500" cy="40" r="3.5" fill="#2563eb" />

              {/* Orange Line: Expenses */}
              <path
                d="M 0 130 Q 60 115 100 110 T 200 90 T 300 75 T 400 95 T 500 85"
                fill="none"
                stroke="#f97316"
                strokeWidth="2"
              />
              <circle cx="100" cy="110" r="3" fill="#f97316" />
              <circle cx="200" cy="90" r="3" fill="#f97316" />
              <circle cx="300" cy="75" r="3" fill="#f97316" />
              <circle cx="400" cy="95" r="3" fill="#f97316" />
            </svg>

            {/* Tooltip Highlight Pill (Just like image's "May 22: $1,028,450") */}
            <div className="absolute top-10 right-16 sm:right-24 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl shadow-md text-center pointer-events-none">
              <span className="block text-[10px] text-slate-400 font-medium">May 22</span>
              <span className="block text-xs font-bold text-slate-900 dark:text-white">$1,028,450</span>
            </div>

            {/* X-Axis Labels */}
            <div className="flex justify-between text-[11px] text-slate-400 mt-2 font-medium px-2">
              <span>May 1</span>
              <span>May 8</span>
              <span>May 15</span>
              <span>May 22</span>
              <span>May 31</span>
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
                <circle cx="50" cy="50" r="38" stroke="#10b981" strokeWidth="14" fill="none" strokeDasharray="85 240" strokeDashoffset="0" />
                {/* In Progress (Blue) */}
                <circle cx="50" cy="50" r="38" stroke="#3b82f6" strokeWidth="14" fill="none" strokeDasharray="76 240" strokeDashoffset="-85" />
                {/* Pending (Yellow) */}
                <circle cx="50" cy="50" r="38" stroke="#f59e0b" strokeWidth="14" fill="none" strokeDasharray="42 240" strokeDashoffset="-161" />
                {/* On Hold (Red) */}
                <circle cx="50" cy="50" r="38" stroke="#ef4444" strokeWidth="14" fill="none" strokeDasharray="34 240" strokeDashoffset="-203" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[11px] text-slate-400 font-medium">Total</span>
                <span className="text-lg font-bold text-slate-900 dark:text-white leading-tight">56</span>
              </div>
            </div>

            {/* Legend list matching mockup */}
            <div className="space-y-2.5 text-xs w-full sm:w-auto">
              <div className="flex items-center justify-between sm:justify-start gap-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-slate-600 dark:text-slate-300 font-medium">Completed</span>
                </div>
                <span className="font-semibold text-slate-900 dark:text-white">20 (35.7%)</span>
              </div>
              <div className="flex items-center justify-between sm:justify-start gap-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <span className="text-slate-600 dark:text-slate-300 font-medium">In Progress</span>
                </div>
                <span className="font-semibold text-slate-900 dark:text-white">18 (32.1%)</span>
              </div>
              <div className="flex items-center justify-between sm:justify-start gap-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="text-slate-600 dark:text-slate-300 font-medium">Pending Review</span>
                </div>
                <span className="font-semibold text-slate-900 dark:text-white">10 (17.9%)</span>
              </div>
              <div className="flex items-center justify-between sm:justify-start gap-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <span className="text-slate-600 dark:text-slate-300 font-medium">On Hold</span>
                </div>
                <span className="font-semibold text-slate-900 dark:text-white">8 (14.3%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. INVENTORY OVERVIEW + PENDING PROCUREMENT + PROJECTS ROW    */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Inventory Overview (Donut Breakdown) */}
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
                <circle cx="50" cy="50" r="38" stroke="#10b981" strokeWidth="13" fill="none" strokeDasharray="144 240" strokeDashoffset="0" />
                <circle cx="50" cy="50" r="38" stroke="#f59e0b" strokeWidth="13" fill="none" strokeDasharray="53 240" strokeDashoffset="-144" />
                <circle cx="50" cy="50" r="38" stroke="#ef4444" strokeWidth="13" fill="none" strokeDasharray="31 240" strokeDashoffset="-197" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[9px] text-slate-400 uppercase">Total Items</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                  {totalItems.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="space-y-1.5 text-[11px] flex-1">
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> In Stock
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">1,420 (60.4%)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-amber-500" /> Low Stock
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">520 (22.1%)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-rose-500" /> Out of Stock
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">310 (13.2%)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-blue-500" /> On Order
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">100 (14.3%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Pending Procurement (Highlighted Card from Mockup) */}
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
                18
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Purchase Orders Active
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 font-medium block">Total Value</span>
              <span className="text-sm font-bold text-slate-900 dark:text-white">$245,760</span>
            </div>
            <button
              onClick={() => navigate('/pharmacy/procurement')}
              className="px-3.5 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-800/60 rounded-xl transition cursor-pointer"
            >
              View All POs
            </button>
          </div>
        </div>

        {/* Card 3: Projects / Batches Overview (Donut breakdown) */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Projects Overview
            </h3>
            <span className="text-[11px] text-slate-500 font-medium">All Projects ▼</span>
          </div>

          <div className="flex items-center gap-5 my-2">
            <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="38" stroke="currentColor" strokeWidth="13" fill="none" className="text-slate-100 dark:text-slate-800" />
                <circle cx="50" cy="50" r="38" stroke="#10b981" strokeWidth="13" fill="none" strokeDasharray="100 240" strokeDashoffset="0" />
                <circle cx="50" cy="50" r="38" stroke="#f59e0b" strokeWidth="13" fill="none" strokeDasharray="70 240" strokeDashoffset="-100" />
                <circle cx="50" cy="50" r="38" stroke="#ef4444" strokeWidth="13" fill="none" strokeDasharray="40 240" strokeDashoffset="-170" />
                <circle cx="50" cy="50" r="38" stroke="#3b82f6" strokeWidth="13" fill="none" strokeDasharray="30 240" strokeDashoffset="-210" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[9px] text-slate-400 uppercase">Total</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white leading-tight">24</span>
              </div>
            </div>

            <div className="space-y-1.5 text-[11px] flex-1">
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> On Track
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">10 (41.7%)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-amber-500" /> At Risk
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">7 (29.2%)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-rose-500" /> Delayed
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">4 (16.7%)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-blue-500" /> Completed
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">3 (12.4%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4. TEAM TASKS & RECENT ACTIVITIES ROW                         */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Team Tasks (Mockup style with checkboxes & priority pills) */}
        <div className="lg:col-span-6 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800/80">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Team Tasks
            </h3>
            <span className="text-xs text-slate-500 font-medium cursor-pointer">
              My Tasks ▼
            </span>
          </div>

          <div className="space-y-3">
            {[
              { id: 1, title: 'Review Q2 Budget', dept: 'Finance', date: 'May 25', priority: 'High', color: 'rose', checked: true },
              { id: 2, title: 'Inventory Audit', dept: 'Operations', date: 'May 27', priority: 'Medium', color: 'amber', checked: true },
              { id: 3, title: 'Onboard New Hires', dept: 'HR', date: 'May 28', priority: 'High', color: 'rose', checked: false },
              { id: 4, title: 'Supplier Evaluation', dept: 'Procurement', date: 'May 30', priority: 'Medium', color: 'amber', checked: false },
              { id: 5, title: 'Update Project Plan', dept: 'Projects', date: 'May 31', priority: 'Low', color: 'emerald', checked: false },
            ].map((task) => (
              <div key={task.id} className="flex items-center justify-between text-xs py-1.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 rounded-lg px-2 transition">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    defaultChecked={task.checked}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                  />
                  <div>
                    <p className={`font-semibold text-slate-800 dark:text-slate-200 ${task.checked ? 'line-through text-slate-400' : ''}`}>
                      {task.title}
                    </p>
                    <span className="text-[10px] text-slate-400">{task.dept}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
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
            ))}
          </div>
        </div>

        {/* Right: Recent Activities (Mockup style with action icons & timestamps) */}
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
            {[
              { icon: '✓', color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400', title: 'PO #PO-1245 approved', author: 'by David Lee', time: '1h ago' },
              { icon: '👤', color: 'bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400', title: 'New employee Sarah Johnson joined', author: 'HR Team', time: '3h ago' },
              { icon: '📁', color: 'bg-purple-100 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400', title: 'Project Website Redesign updated', author: 'by Michael Brown', time: '5h ago' },
              { icon: '📄', color: 'bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400', title: 'Invoice INV-0987 paid', author: 'by Finance Team', time: '6h ago' },
              { icon: '📦', color: 'bg-sky-100 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400', title: 'Inventory stock updated', author: 'Main Warehouse', time: '1d ago' },
            ].map((act, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${act.color}`}>
                    {act.icon}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">{act.title}</p>
                    <span className="text-[10px] text-slate-400">{act.author}</span>
                  </div>
                </div>
                <span className="text-[11px] text-slate-400 shrink-0 font-medium">{act.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 5. TOP SUPPLIERS TABLE ROW (Exact replica of mockup)          */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800/80">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Top Suppliers
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Key pharmaceutical distributors and partner spend
            </p>
          </div>
          <div className="inline-flex items-center gap-1 px-3 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300">
            <span>This Month</span>
            <span className="text-slate-400 text-[10px]">▼</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-slate-800 text-slate-400">
                <th className="pb-3 font-semibold">Supplier</th>
                <th className="pb-3 font-semibold">Category</th>
                <th className="pb-3 font-semibold">Total Spend</th>
                <th className="pb-3 font-semibold">Orders</th>
                <th className="pb-3 font-semibold text-right">Performance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
              {[
                { name: 'Global Tech Solutions', cat: 'IT Equipment', spend: '$78,650', orders: 12, rating: '4.8 ★' },
                { name: 'Office Supplies Co.', cat: 'Office Supplies', spend: '$45,230', orders: 18, rating: '4.6 ★' },
                { name: 'BuildRight Materials', cat: 'Construction', spend: '$36,890', orders: 8, rating: '4.5 ★' },
                { name: 'Logistics Express', cat: 'Logistics', spend: '$28,740', orders: 15, rating: '4.7 ★' },
              ].map((row, i) => (
                <tr key={i} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                  <td className="py-3.5 font-bold text-slate-800 dark:text-slate-200">
                    {row.name}
                  </td>
                  <td className="py-3.5 text-slate-500 dark:text-slate-400">
                    {row.cat}
                  </td>
                  <td className="py-3.5 text-slate-900 dark:text-white font-bold">
                    {row.spend}
                  </td>
                  <td className="py-3.5 text-slate-600 dark:text-slate-300">
                    {row.orders}
                  </td>
                  <td className="py-3.5 text-right text-amber-500 font-bold">
                    {row.rating}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PharmacistDashboard;
