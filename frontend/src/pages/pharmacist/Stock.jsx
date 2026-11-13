import { useState, useCallback, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getStockBatches, getInventorySummary, deleteStockBatch } from '../../api/stockApi';
import useAsync from '../../hooks/useAsync';
import StockInModal from './StockInModal';
import StockAdjustModal from './StockAdjustModal';
import StockKpiCards from '../../components/stock/StockKpiCards';
import StockFilters from '../../components/stock/StockFilters';
import StockBatchTable from '../../components/stock/StockBatchTable';
import { getDaysUntilExpiry } from '../../components/stock/stockUtils';

const Stock = () => {
  const { t } = useTranslation('stock');
  const [statusFilter, setStatusFilter] = useState('active');
  const [search, setSearch] = useState('');

  // Modals state
  const [isStockInOpen, setIsStockInOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const fetchStock = useCallback(async () => {
    try {
      const params = {};
      if (statusFilter && statusFilter !== 'expiring') {
        params.status = statusFilter;
      }

      const [batchRes, summaryRes] = await Promise.all([
        getStockBatches(params),
        getInventorySummary(),
      ]);

      return { batches: batchRes.batches || [], summary: summaryRes.summary || null };
    } catch (err) {
      console.error('Failed to load stock data:', err);
      throw err;
    }
  }, [statusFilter]);
  const { data, loading: fetching, reload: loadData } = useAsync(fetchStock);
  // The skeleton only shows for the first load; later refreshes keep the current rows on screen.
  const loading = fetching && !data;
  const batches = useMemo(() => data?.batches || [], [data]);
  const summary = data?.summary || null;

  const handleOpenAdjust = (batch) => {
    setSelectedBatch(batch);
    setIsAdjustOpen(true);
  };

  const handleDelete = async (id, batchNo) => {
    if (!window.confirm(t('page.confirmDelete', { batchNo }))) {
      return;
    }

    setDeletingId(id);
    try {
      await deleteStockBatch(id);
      await loadData();
    } catch (err) {
      alert(err.response?.data?.message || t('page.deleteFailed'));
    } finally {
      setDeletingId(null);
    }
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

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 uppercase tracking-wider">
              {t('page.badge')}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">
            {t('page.title')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('page.subtitle')}
          </p>
        </div>

        <button
          onClick={() => setIsStockInOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer self-start sm:self-auto shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{t('page.recordStockIn')}</span>
        </button>
      </div>

      {/* KPI Metric Cards */}
      <StockKpiCards batches={batches} summary={summary} />

      {/* Filter and Search Bar */}
      <StockFilters
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
      />

      {/* Main Batches Table */}
      <StockBatchTable
        loading={loading}
        batches={filteredBatches}
        totalCount={batches.length}
        hasFilter={!!(search || statusFilter)}
        onStockIn={() => setIsStockInOpen(true)}
        onAdjust={handleOpenAdjust}
        onDelete={handleDelete}
        deletingId={deletingId}
      />

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
