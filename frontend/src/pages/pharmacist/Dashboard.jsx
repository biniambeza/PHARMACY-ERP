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
        if (medRes.status === 'fulfilled') setMedicinesCount(medRes.value.total || medRes.value.medicines?.length || 0);
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto selection:bg-emerald-500 selection:text-white">
      {/* Welcome & Operational Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        {/* Glow decoration */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Pharmacist Station • Live Workspace
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Welcome back, {user?.name || 'Pharmacist'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
              {pharmacy ? (
                <>
                  <span className="text-slate-200 font-semibold">{pharmacy.name}</span>
                  {' • '}
                  <span className="font-mono text-emerald-400">Lic: {pharmacy.licenseNo}</span>
                  {' • '}
                  <span>{pharmacy.address}</span>
                </>
              ) : (
                'Manage real-time inventory, dispensary checkout, and supplier procurement'
              )}
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={() => navigate('/pharmacy/pos')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-950 transition transform hover:-translate-y-0.5 cursor-pointer"
            >
              <span>⚡</span> Launch POS Register
            </button>
            <button
              onClick={() => navigate('/pharmacy/medicines')}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <span>💊</span> Add Medicine
            </button>
            <button
              onClick={() => navigate('/pharmacy/stock')}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <span>📦</span> Receive Stock
            </button>
            <button
              onClick={() => navigate('/pharmacy/procurement')}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <span>📑</span> New PO
            </button>
          </div>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Revenue */}
        <div className="bg-slate-900 border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-5 transition shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400">Today's Revenue</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-sm">
              💰
            </div>
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            ${salesSummary ? Number(salesSummary.todayRevenue).toFixed(2) : '0.00'}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-400">
            <span className="font-semibold">{salesSummary?.todaySalesCount || 0}</span>
            <span className="text-slate-500">dispenses completed today</span>
          </div>
        </div>

        {/* Inventory Units */}
        <div className="bg-slate-900 border border-slate-800 hover:border-blue-500/40 rounded-2xl p-5 transition shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400">Stock Inventory</span>
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-sm">
              📦
            </div>
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            {inventorySummary ? inventorySummary.totalStockUnits.toLocaleString() : '0'}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-blue-400">
            <span className="font-semibold">{inventorySummary?.totalBatches || 0}</span>
            <span className="text-slate-500">active batches on shelf</span>
          </div>
        </div>

        {/* Catalog Medicines */}
        <div className="bg-slate-900 border border-slate-800 hover:border-purple-500/40 rounded-2xl p-5 transition shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400">Formulary Catalog</span>
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 text-sm">
              💊
            </div>
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            {medicinesCount}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-purple-400">
            <span>Verified pharmaceuticals registered</span>
          </div>
        </div>

        {/* Expiry & Low Stock Risk */}
        <div className="bg-slate-900 border border-slate-800 hover:border-amber-500/40 rounded-2xl p-5 transition shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400">Stock Alerts (FEFO)</span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-sm">
              ⚠️
            </div>
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            {(inventorySummary?.expiringSoonCount || 0) + (inventorySummary?.lowStockCount || 0)}
          </div>
          <div className="flex items-center gap-2 mt-2 text-[11px]">
            <span className="text-amber-400 font-semibold">
              {inventorySummary?.expiringSoonCount || 0} expiring (30d)
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-rose-400 font-semibold">
              {inventorySummary?.lowStockCount || 0} low stock
            </span>
          </div>
        </div>
      </div>

      {/* Main Two-Column Operational Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Recent Sales Activity & Quick Modules (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Recent Sales Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
              <div>
                <h2 className="text-base font-bold text-white tracking-tight">Recent Sales & Invoices</h2>
                <p className="text-xs text-slate-400">Latest dispensed prescriptions & counter sales</p>
              </div>
              <Link
                to="/pharmacy/sales"
                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition flex items-center gap-1"
              >
                View all sales →
              </Link>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-slate-500">Loading recent transactions...</div>
            ) : recentSales.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <p className="text-sm font-semibold text-slate-300">No sales transactions recorded yet</p>
                <p className="text-xs text-slate-500">Process your first checkout using the Point of Sale register.</p>
                <button
                  onClick={() => navigate('/pharmacy/pos')}
                  className="mt-2 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition"
                >
                  Go to POS
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="pb-3 font-semibold">Invoice</th>
                      <th className="pb-3 font-semibold">Customer</th>
                      <th className="pb-3 font-semibold">Items</th>
                      <th className="pb-3 font-semibold">Method</th>
                      <th className="pb-3 font-semibold text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {recentSales.map((sale) => (
                      <tr key={sale._id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3 font-mono font-medium text-emerald-400">
                          {sale.invoiceNumber}
                        </td>
                        <td className="py-3 text-slate-200">
                          {sale.customer?.name || 'Walk-in'}
                        </td>
                        <td className="py-3 text-slate-400">
                          {sale.items?.length || 0} meds
                        </td>
                        <td className="py-3">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
                            {sale.paymentMethod || 'cash'}
                          </span>
                        </td>
                        <td className="py-3 text-right font-bold text-white">
                          ${Number(sale.grandTotal).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Quick Module Deck */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link
              to="/pharmacy/medicines"
              className="bg-slate-900 border border-slate-800 hover:border-purple-500/50 p-4 rounded-xl transition group"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-purple-400">Catalog</span>
                <span className="text-slate-500 group-hover:translate-x-0.5 transition">→</span>
              </div>
              <h4 className="text-sm font-bold text-white">Medicine List</h4>
              <p className="text-[11px] text-slate-400 mt-1">Dosages, categories & pricing</p>
            </Link>

            <Link
              to="/pharmacy/stock"
              className="bg-slate-900 border border-slate-800 hover:border-blue-500/50 p-4 rounded-xl transition group"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-blue-400">Inventory</span>
                <span className="text-slate-500 group-hover:translate-x-0.5 transition">→</span>
              </div>
              <h4 className="text-sm font-bold text-white">Batches & FEFO</h4>
              <p className="text-[11px] text-slate-400 mt-1">Adjustments & stock receiving</p>
            </Link>

            <Link
              to="/pharmacy/procurement"
              className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 p-4 rounded-xl transition group"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-emerald-400">Purchasing</span>
                <span className="text-slate-500 group-hover:translate-x-0.5 transition">→</span>
              </div>
              <h4 className="text-sm font-bold text-white">Purchase Orders</h4>
              <p className="text-[11px] text-slate-400 mt-1">Vendor orders & GRN receiving</p>
            </Link>
          </div>
        </div>

        {/* Right Column: FEFO Watchlist & Tenant Security (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* FEFO Expiry & Low Stock Watchlist */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white">Stock Risk Watchlist</h3>
                <p className="text-[11px] text-slate-400">First-Expired First-Out alerts</p>
              </div>
              <Link
                to="/pharmacy/stock"
                className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition"
              >
                Manage stock →
              </Link>
            </div>

            {loading ? (
              <div className="py-6 text-center text-xs text-slate-500">Checking expiry dates...</div>
            ) : inventorySummary?.expiringSoonBatches?.length > 0 ? (
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                {inventorySummary.expiringSoonBatches.map((batch) => (
                  <div
                    key={batch._id}
                    className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <p className="font-bold text-white">{batch.medicineId?.name || 'Medicine'}</p>
                      <p className="text-[11px] text-slate-400 font-mono">
                        Batch: {batch.batchNo} • Qty: {batch.quantity}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-bold text-amber-400 block">
                        Exp: {new Date(batch.expiryDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3">
                <span className="text-emerald-400 text-lg">✓</span>
                <div>
                  <p className="text-xs font-bold text-emerald-400">All Batches Within Safe Dates</p>
                  <p className="text-[11px] text-slate-400">No medicines expiring in the next 30 days.</p>
                </div>
              </div>
            )}

            {/* Low stock indicators */}
            {inventorySummary?.lowStockMedicines?.length > 0 && (
              <div className="pt-2 border-t border-slate-800/80 space-y-2">
                <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider block">
                  Re-order Level Required ({inventorySummary.lowStockMedicines.length})
                </span>
                <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                  {inventorySummary.lowStockMedicines.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-800/60 border border-slate-700/60"
                    >
                      <span className="text-slate-200 font-medium truncate">{item.name}</span>
                      <span className="text-[11px] text-rose-400 font-mono shrink-0">
                        Stock: {item.currentStock} / Min: {item.minStockLevel}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Pharmacy Tenant & Isolation Details */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Tenant License & Compliance
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                Isolated Database Scope
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800 text-slate-300">
                <span className="text-slate-400">Licensed Entity:</span>
                <span className="font-bold text-white">{pharmacy?.name || 'Loading...'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800 text-slate-300">
                <span className="text-slate-400">License Number:</span>
                <span className="font-mono text-emerald-400">{pharmacy?.licenseNo || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800 text-slate-300">
                <span className="text-slate-400">Dispensary Phone:</span>
                <span>{pharmacy?.phone || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1 text-slate-300">
                <span className="text-slate-400">Tenant Identifier:</span>
                <code className="text-[10px] text-slate-400 font-mono truncate max-w-[160px]">
                  {pharmacy?._id || 'Loading...'}
                </code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PharmacistDashboard;
