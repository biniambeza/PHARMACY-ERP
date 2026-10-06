import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Boxes,
  Plus,
  Search,
  AlertTriangle,
  SlidersHorizontal,
  Trash2,
  DollarSign,
  Layers,
  Clock,
  Pill,
} from 'lucide-react';
import { getStockBatches, getInventorySummary, deleteStockBatch } from '../../api/stockApi';
import StockInModal from './StockInModal';
import StockAdjustModal from './StockAdjustModal';
import MetricCard from '../../components/common/MetricCard';
import StatusBadge from '../../components/common/StatusBadge';
import { CardSkeleton } from '../../components/common/SkeletonLoader';

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
      if (statusFilter && statusFilter !== 'expiring') {
        params.status = statusFilter;
      }

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

  const getDaysUntilExpiry = (dateStr) => {
    if (!dateStr) return null;
    const now = new Date();
    const expiry = new Date(dateStr);
    return Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
  };

  // Filter batches by search term & active expiry filter
  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      if (statusFilter === 'expiring') {
        const days = getDaysUntilExpiry(b.expiryDate);
        if (days === null || days > 30) return false;
      }

      const medName = b.medicineId?.name?.toLowerCase() || '';
      const genericName = b.medicineId?.genericName?.toLowerCase() || '';
      const batchNo = b.batchNo?.toLowerCase() || '';
      const query = search.toLowerCase();
      return medName.includes(query) || genericName.includes(query) || batchNo.includes(query);
    });
  }, [batches, search, statusFilter]);

  // Inventory Metrics from real summary or batch calculations
  const totalActiveBatches = summary?.activeBatchesCount ?? batches.filter((b) => b.quantity > 0).length;
  const totalStockUnits = summary?.totalUnits ?? batches.reduce((acc, b) => acc + (b.quantity || 0), 0);
  const totalValuation = summary?.totalValuation ?? batches.reduce((acc, b) => acc + (b.quantity || 0) * (b.purchasePrice || 0), 0);
  const expiringSoonCount = batches.filter((b) => {
    const days = getDaysUntilExpiry(b.expiryDate);
    return days !== null && days <= 30 && b.quantity > 0;
  }).length;

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/50 px-2.5 py-0.5 rounded-full border border-teal-200 dark:border-teal-800/60 uppercase tracking-wider">
              FEFO Protocol
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">
            Inventory & Stock Batches
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Monitor real-time lot allocations, enforce First-Expired-First-Out dispensing, and record stock receipts
          </p>
        </div>

        <button
          onClick={() => setIsStockInOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer self-start sm:self-auto shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Record Stock In</span>
        </button>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <MetricCard
          title="Active Lots on Hand"
          value={totalActiveBatches.toString()}
          subValue="Available for dispensing"
          badgeText="Active"
          badgeVariant="teal"
          icon={<Boxes className="w-4 h-4 text-teal-600 dark:text-teal-400" />}
          sparklineData={[12, 16, 14, 20, 22, 28, 25, totalActiveBatches]}
          sparklineColor="#0d9488"
          sparklineId="active-stock-spark"
        />

        <MetricCard
          title="Total Stock Units"
          value={totalStockUnits.toLocaleString()}
          subValue="Units across active catalog"
          badgeText="Volume"
          badgeVariant="emerald"
          icon={<Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
          sparklineData={[140, 180, 210, 290, 310, 390, 420, totalStockUnits]}
          sparklineColor="#10b981"
          sparklineId="stock-units-spark"
        />

        <MetricCard
          title="Total Stock Valuation"
          value={`$${Number(totalValuation).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subValue="Wholesale asset value"
          badgeText="Capital"
          badgeVariant="indigo"
          icon={<DollarSign className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
          sparklineData={[1200, 1450, 1300, 1900, 2100, 2400, 2800, totalValuation]}
          sparklineColor="#6366f1"
          sparklineId="stock-val-spark"
        />

        <MetricCard
          title="Expiry Risk (<30 Days)"
          value={expiringSoonCount.toString()}
          subValue={expiringSoonCount > 0 ? 'Requires priority sale' : 'No near-term expirations'}
          badgeText={expiringSoonCount > 0 ? 'Action Needed' : 'Compliant'}
          badgeVariant={expiringSoonCount > 0 ? 'rose' : 'teal'}
          icon={<AlertTriangle className={`w-4 h-4 ${expiringSoonCount > 0 ? 'text-rose-500' : 'text-teal-500'}`} />}
          sparklineData={[4, 2, 6, 3, 5, 2, 1, expiringSoonCount]}
          sparklineColor={expiringSoonCount > 0 ? '#f43f5e' : '#0d9488'}
          sparklineId="expiry-spark"
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-[#161c26] border border-slate-100/90 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by lot batch number, brand name, or active formula..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-medium">
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
                statusFilter === 'active'
                  ? 'bg-white dark:bg-[#161c26] text-teal-600 dark:text-teal-400 font-bold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Active Stock
            </button>
            <button
              onClick={() => setStatusFilter('expiring')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
                statusFilter === 'expiring'
                  ? 'bg-white dark:bg-[#161c26] text-amber-600 dark:text-amber-400 font-bold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Expiring Soon
            </button>
            <button
              onClick={() => setStatusFilter('depleted')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
                statusFilter === 'depleted'
                  ? 'bg-white dark:bg-[#161c26] text-slate-800 dark:text-white font-bold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Depleted
            </button>
            <button
              onClick={() => setStatusFilter('')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
                statusFilter === ''
                  ? 'bg-white dark:bg-[#161c26] text-teal-600 dark:text-teal-400 font-bold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All Batches
            </button>
          </div>

          {search && (
            <button
              onClick={() => setSearch('')}
              className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition font-medium cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Main Batches Table */}
      <div className="bg-white dark:bg-[#161c26] border border-slate-100/90 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8">
              <CardSkeleton height="h-64" />
            </div>
          ) : filteredBatches.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 flex items-center justify-center mx-auto mb-3 border border-teal-100 dark:border-teal-900/50">
                <Boxes className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {search || statusFilter ? 'No matching inventory batches' : 'No stock recorded'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                {search || statusFilter
                  ? 'Try modifying your search query or filter parameters'
                  : 'Receive incoming pharmaceutical shipments or direct stock to begin dispensing'}
              </p>
              <button
                onClick={() => setIsStockInOpen(true)}
                className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-xl shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Record First Stock In
              </button>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800 text-[11px]">
                <tr>
                  <th className="py-3.5 px-5">Batch Lot No</th>
                  <th className="py-3.5 px-4">Medicine Item</th>
                  <th className="py-3.5 px-4">Available Units</th>
                  <th className="py-3.5 px-4">Expiration Date (FEFO)</th>
                  <th className="py-3.5 px-4">Unit Cost</th>
                  <th className="py-3.5 px-4">Batch Valuation</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80 dark:divide-slate-800/60 font-medium">
                {filteredBatches.map((batch) => {
                  const daysLeft = getDaysUntilExpiry(batch.expiryDate);
                  const isExpired = daysLeft !== null && daysLeft <= 0;
                  const isCritical = daysLeft !== null && daysLeft > 0 && daysLeft <= 30;
                  const isDepleted = Number(batch.quantity) <= 0;

                  return (
                    <tr
                      key={batch._id}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition group"
                    >
                      {/* Batch Lot No */}
                      <td className="py-3.5 px-5">
                        <span className="font-mono font-bold text-slate-900 dark:text-white block group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                          {batch.batchNo}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {batch._id?.slice(-6).toUpperCase()}
                        </span>
                      </td>

                      {/* Medicine Item */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0 border border-teal-100 dark:border-teal-900/50">
                            <Pill className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white block">
                              {batch.medicineId?.name || 'Unnamed Product'}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              {batch.medicineId?.dosageForm || 'Unit'} • {batch.medicineId?.category || 'General'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Quantity */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono font-bold text-sm ${
                            isDepleted
                              ? 'text-slate-400'
                              : batch.quantity <= (batch.medicineId?.minStockLevel || 10)
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-900 dark:text-white'
                          }`}>
                            {batch.quantity}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">units</span>
                        </div>
                      </td>

                      {/* Expiration Date with FEFO Tag */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <span className="text-slate-800 dark:text-slate-200 font-medium block">
                            {batch.expiryDate
                              ? new Date(batch.expiryDate).toLocaleDateString(undefined, {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : 'N/A'}
                          </span>
                          {isExpired ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                              <AlertTriangle className="w-3 h-3 text-rose-500" /> Expired
                            </span>
                          ) : isCritical ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                              <Clock className="w-3 h-3 text-amber-500" /> {daysLeft}d remaining
                            </span>
                          ) : daysLeft !== null ? (
                            <span className="text-[10px] text-slate-400 font-mono">
                              {daysLeft} days valid
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Unit Cost */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-slate-600 dark:text-slate-300">
                          ${Number(batch.purchasePrice || 0).toFixed(2)}
                        </span>
                      </td>

                      {/* Batch Valuation */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          ${((Number(batch.quantity) || 0) * (Number(batch.purchasePrice) || 0)).toFixed(2)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {isDepleted ? (
                          <StatusBadge status="depleted" label="Depleted" />
                        ) : isExpired ? (
                          <StatusBadge status="out_of_stock" label="Expired" />
                        ) : isCritical ? (
                          <StatusBadge status="warning" label="Expiring" />
                        ) : (
                          <StatusBadge status="active" label="Available" />
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isDepleted && (
                            <button
                              onClick={() => handleOpenAdjust(batch)}
                              title="Adjust stock (write-off / damaged)"
                              className="p-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-50 dark:text-slate-400 dark:hover:text-amber-400 dark:hover:bg-amber-950/30 rounded-lg transition cursor-pointer"
                            >
                              <SlidersHorizontal className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(batch._id, batch.batchNo)}
                            disabled={deletingId === batch._id}
                            title="Delete batch record"
                            className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 dark:text-slate-400 dark:hover:text-rose-400 dark:hover:bg-rose-950/30 rounded-lg transition disabled:opacity-40 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer Summary */}
        {filteredBatches.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-800/20">
            <span>
              Showing <strong>{filteredBatches.length}</strong> of{' '}
              <strong>{batches.length}</strong> inventory batches
            </span>
            <span className="font-mono text-[11px]">
              Protocol: FEFO Compliance Enforced
            </span>
          </div>
        )}
      </div>

      {/* Stock In Modal */}
      <StockInModal
        isOpen={isStockInOpen}
        onClose={() => setIsStockInOpen(false)}
        onSuccess={loadData}
      />

      {/* Stock Adjust Modal */}
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
