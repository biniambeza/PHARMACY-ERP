import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getStockBatches, getInventorySummary, deleteStockBatch } from '../../api/stockApi';
import StockInModal from './StockInModal';
import StockAdjustModal from './StockAdjustModal';

const Stock = () => {
  const [batches, setBatches] = useState([]);
  const [summary, setSummary] = useState(null);
  const [statusFilter, setStatusFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Modals state
  const [isStockInOpen, setIsStockInOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;

      const [batchRes, summaryRes] = await Promise.all([
        getStockBatches(params),
        getInventorySummary(),
      ]);

      setBatches(batchRes.batches || []);
      setSummary(summaryRes.summary || null);
    } catch (err) {
      console.error('Failed to load stock data:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenAdjust = (batch) => {
    setSelectedBatch(batch);
    setIsAdjustOpen(true);
  };

  const handleDelete = async (id, batchNo) => {
    if (!window.confirm(`Are you sure you want to permanently delete batch "${batchNo}"?`)) {
      return;
    }

    setDeletingId(id);
    try {
      await deleteStockBatch(id);
      await loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete batch');
    } finally {
      setDeletingId(null);
    }
  };

  // Filter batches by search term (medicine name or batch number)
  const filteredBatches = batches.filter((b) => {
    const medName = b.medicineId?.name?.toLowerCase() || '';
    const genericName = b.medicineId?.genericName?.toLowerCase() || '';
    const batchNo = b.batchNo?.toLowerCase() || '';
    const query = search.toLowerCase();
    return medName.includes(query) || genericName.includes(query) || batchNo.includes(query);
  });

  const isExpiringSoon = (dateStr) => {
    const now = new Date();
    const expiry = new Date(dateStr);
    const diffDays = (expiry - now) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 30;
  };

  const isExpired = (dateStr) => {
    return new Date(dateStr) < new Date();
  };

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
            <h1 className="text-2xl font-bold text-white tracking-tight">Inventory & Stock Batches</h1>
            <p className="text-xs text-slate-400">
              Track stock levels, monitor expiration dates (FEFO), and record stock additions
            </p>
          </div>

          <button
            onClick={() => setIsStockInOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-md transition cursor-pointer self-start sm:self-auto"
          >
            <span className="text-base leading-none font-bold">+</span> Receive Stock (Stock-In)
          </button>
        </div>

        {/* Inventory Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
                Active Batches
              </span>
              <p className="text-2xl font-bold text-white font-mono">{summary.totalBatches}</p>
            </div>

            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
                Total Stock Units
              </span>
              <p className="text-2xl font-bold text-emerald-400 font-mono">
                {summary.totalStockUnits.toLocaleString()}
              </p>
            </div>

            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
                Low Stock Alerts
              </span>
              <p
                className={`text-2xl font-bold font-mono ${
                  summary.lowStockCount > 0 ? 'text-amber-400' : 'text-slate-400'
                }`}
              >
                {summary.lowStockCount}
              </p>
              {summary.lowStockCount > 0 && (
                <span className="text-[10px] text-amber-400/80 block mt-1">Requires reorder</span>
              )}
            </div>

            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
                Expiring (&lt; 30 Days)
              </span>
              <p
                className={`text-2xl font-bold font-mono ${
                  summary.expiringSoonCount > 0 ? 'text-rose-400' : 'text-slate-400'
                }`}
              >
                {summary.expiringSoonCount}
              </p>
              {summary.expiringSoonCount > 0 && (
                <span className="text-[10px] text-rose-400/80 block mt-1">Immediate attention</span>
              )}
            </div>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="bg-slate-800 border border-slate-700/80 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="w-full sm:w-72">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search batch or medicine name..."
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="w-full sm:w-auto flex items-center gap-3">
            <label className="text-xs text-slate-400 hidden sm:inline">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full sm:w-40 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="depleted">Depleted</option>
              <option value="expired">Expired</option>
            </select>
            {(search || statusFilter !== 'active') && (
              <button
                onClick={() => {
                  setSearch('');
                  setStatusFilter('active');
                }}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 transition cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Stock Batches Table */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center text-xs text-slate-400">Loading stock inventory...</div>
            ) : filteredBatches.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm font-semibold text-slate-300 mb-1">
                  {search ? 'No matching batches found' : 'No stock batches found'}
                </p>
                <p className="text-xs text-slate-500 mb-4">
                  {search
                    ? 'Try adjusting your search keywords.'
                    : 'Start receiving medicine batches to manage physical inventory.'}
                </p>
                <button
                  onClick={() => setIsStockInOpen(true)}
                  className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  + Receive First Batch
                </button>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-700/60">
                  <tr>
                    <th className="py-3 px-4">Medicine & Form</th>
                    <th className="py-3 px-4">Batch Number</th>
                    <th className="py-3 px-4">Available / Initial</th>
                    <th className="py-3 px-4">Expiry Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {filteredBatches.map((b) => {
                    const expiring = isExpiringSoon(b.expiryDate);
                    const expired = isExpired(b.expiryDate);

                    return (
                      <tr key={b._id} className="hover:bg-slate-700/30 transition">
                        <td className="py-3 px-4">
                          <span className="font-semibold text-white block">
                            {b.medicineId?.name || 'Unknown Medicine'}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {b.medicineId?.dosageForm || ''}{' '}
                            {b.medicineId?.strength ? `• ${b.medicineId.strength}` : ''}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-emerald-400 font-medium">{b.batchNo}</span>
                          {b.purchasePrice > 0 && (
                            <span className="text-[10px] text-slate-500 block font-mono">
                              Cost: ${b.purchasePrice.toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono">
                          <span className="text-white font-bold text-sm">{b.quantity}</span>
                          <span className="text-slate-500 text-[11px]"> / {b.initialQuantity}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`font-mono block ${
                              expired
                                ? 'text-rose-400 font-bold'
                                : expiring
                                ? 'text-amber-400 font-bold'
                                : 'text-slate-300'
                            }`}
                          >
                            {new Date(b.expiryDate).toLocaleDateString()}
                          </span>
                          {expired ? (
                            <span className="text-[10px] text-rose-400 font-semibold">Expired</span>
                          ) : expiring ? (
                            <span className="text-[10px] text-amber-400 font-semibold">Expiring Soon</span>
                          ) : null}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              b.status === 'active'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : b.status === 'expired'
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                : 'bg-slate-700 text-slate-300'
                            }`}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            onClick={() => handleOpenAdjust(b)}
                            disabled={b.quantity === 0}
                            className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[11px] font-medium transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            Adjust
                          </button>
                          <button
                            onClick={() => handleDelete(b._id, b.batchNo)}
                            disabled={deletingId === b._id}
                            className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded text-[11px] font-medium transition cursor-pointer"
                          >
                            {deletingId === b._id ? 'Deleting...' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <StockInModal
        isOpen={isStockInOpen}
        onClose={() => setIsStockInOpen(false)}
        onSuccess={loadData}
      />

      <StockAdjustModal
        isOpen={isAdjustOpen}
        onClose={() => {
          setIsAdjustOpen(false);
          setSelectedBatch(null);
        }}
        onSuccess={loadData}
        batch={selectedBatch}
      />
    </div>
  );
};

export default Stock;
