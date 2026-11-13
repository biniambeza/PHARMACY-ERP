import { useState, useCallback, useMemo, useEffect } from 'react';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getStockBatches, getInventorySummary, deleteStockBatch } from '../../api/stockApi';
import useAsync from '../../hooks/useAsync';
import StockInModal from './StockInModal';
import StockAdjustModal from './StockAdjustModal';
import StockKpiCards from '../../components/stock/StockKpiCards';
import StockFilters from '../../components/stock/StockFilters';
import StockBatchTable from '../../components/stock/StockBatchTable';
import { logApiError } from '../../api/logApiError';

// Batches per page. The server filters, searches and pages (GET /api/stock), so the page
// stays fast however many batches the pharmacy has.
const PAGE_SIZE = 200;
const EXPIRING_DAYS = 30;

// Status pill -> GET /api/stock params
const statusParams = (statusFilter) => {
  if (statusFilter === 'active') return { status: 'active' };
  if (statusFilter === 'expiring') return { status: 'active', expiringWithin: EXPIRING_DAYS };
  if (statusFilter === 'depleted') return { status: 'depleted' };
  return { includeEmpty: true }; // all
};

const Stock = () => {
  const { t } = useTranslation('stock');
  const [statusFilter, setStatusFilterState] = useState('active');
  const [search, setSearchState] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  const setStatusFilter = (value) => {
    setStatusFilterState(value);
    setPage(1);
  };
  const setSearch = (value) => {
    setSearchState(value);
    setPage(1);
  };

  // Search on the server, after the user pauses typing
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Modals state
  const [isStockInOpen, setIsStockInOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const fetchStock = useCallback(async () => {
    try {
      const params = { ...statusParams(statusFilter), page, limit: PAGE_SIZE };
      if (debouncedSearch) params.q = debouncedSearch;

      const [batchRes, summaryRes] = await Promise.all([
        getStockBatches(params),
        getInventorySummary(),
      ]);

      const batches = batchRes.batches || [];
      return {
        batches,
        total: batchRes.total ?? batches.length,
        pages: batchRes.pages || 1,
        summary: summaryRes.summary || null,
      };
    } catch (err) {
      logApiError('Failed to load stock data', err);
      throw err;
    }
  }, [statusFilter, debouncedSearch, page]);
  const { data, loading: fetching, reload: loadData } = useAsync(fetchStock);
  // The skeleton only shows for the first load; later refreshes keep the current rows on screen.
  const loading = fetching && !data;
  const batches = useMemo(() => data?.batches || [], [data]);
  const summary = data?.summary || null;
  const total = data?.total ?? 0;
  const pages = data?.pages || 1;

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
        batches={batches}
        totalCount={total}
        hasFilter={!!(search || statusFilter)}
        onStockIn={() => setIsStockInOpen(true)}
        onAdjust={handleOpenAdjust}
        onDelete={handleDelete}
        deletingId={deletingId}
      />

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>{t('page.pageOf', { page, pages })}</span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || fetching}
            aria-label={t('common:buttons.previous')}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page >= pages || fetching}
            aria-label={t('common:buttons.next')}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

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
