import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getDashboardOverview } from '../../api/reportApi';
import InvoiceReceiptModal from './InvoiceReceiptModal';
import { useAuth } from '../../context/useAuth';
import useAsync from '../../hooks/useAsync';
import { formatMoney } from '../../utils/format';
import { exportCSV, exportPDF } from '../../utils/export';
import { downloadExport } from '../../api/exportApi';
import { DashboardSkeleton, DashboardError } from '../../components/dashboard/DashboardStates';
import DashboardToolbar from '../../components/dashboard/DashboardToolbar';
import KpiCards from '../../components/dashboard/KpiCards';
import RecentSalesCard from '../../components/dashboard/RecentSalesCard';
import SalesTrendChart from '../../components/dashboard/SalesTrendChart';
import ExpiryHealthCard from '../../components/dashboard/ExpiryHealthCard';
import TopSuppliersCard from '../../components/dashboard/TopSuppliersCard';
import AnomalyAlertsCard from '../../components/dashboard/AnomalyAlertsCard';
import OnboardingChecklist from '../../components/onboarding/OnboardingChecklist';
import { logApiError } from '../../api/logApiError';

const PharmacistDashboard = () => {
  const { t } = useTranslation(['dashboard', 'common']);

  const [tasksState, setTasksState] = useState({});
  const [selectedSale, setSelectedSale] = useState(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [range, setRange] = useState('7d');
  const [exportingSales, setExportingSales] = useState(false);
  const { can, activePharmacy, user } = useAuth();

  const fetchOverview = useCallback(async () => {
    try {
      const res = await getDashboardOverview(range);
      return res.success && res.overview ? res.overview : null;
    } catch (err) {
      logApiError('Failed to load real dashboard overview data', err);
      throw err;
    }
  }, [range]);
  const { data: overview, error: loadError, loading, reload } = useAsync(fetchOverview);
  const error = loadError ? t('error.fetchFailed') : '';

  const toggleTask = (taskId) => {
    setTasksState((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const handleOpenReceipt = (sale) => {
    setSelectedSale(sale);
    setIsReceiptOpen(true);
  };

  if (loading) return <DashboardSkeleton />;

  if (error || !overview) return <DashboardError error={error} onRetry={reload} />;

  const {
    kpis = {},
    revenueVsExpenses = [],
    batchOverview = {},
    operationalTasks = [],
    topSuppliers = [],
    recentSales = [],
  } = overview;
  const period = kpis.period || {};

  const summaryRows = [
    { metric: t('summary.revenue', { range: period.rangeLabel || '' }), value: formatMoney(period.revenue) },
    { metric: t('summary.cogs'), value: formatMoney(period.cogs) },
    { metric: t('summary.grossProfit'), value: formatMoney(period.grossProfit) },
    { metric: t('summary.orders'), value: period.orders ?? 0 },
    { metric: t('summary.refunds'), value: formatMoney(period.refunds) },
    { metric: t('summary.tax'), value: formatMoney(period.tax) },
    { metric: t('summary.revenueGrowth'), value: kpis.revenueGrowth },
    { metric: t('summary.allTimeRevenue'), value: formatMoney(kpis.totalRevenue) },
    { metric: t('summary.allTimeGrossProfit'), value: formatMoney(kpis.netProfit) },
    { metric: t('summary.activeBatches'), value: kpis.activeBatches },
    { metric: t('summary.stockUnits'), value: kpis.totalStockUnits },
  ];
  const salesColumns = [
    { key: 'invoiceNumber', header: t('salesColumns.invoice') },
    { key: 'createdAt', header: t('common:labels.date'), format: (v) => new Date(v).toLocaleString() },
    { key: 'customer', header: t('salesColumns.customer'), format: (v) => v?.name || t('salesColumns.walkIn') },
    { key: 'grandTotal', header: t('common:labels.total'), align: 'right', format: (v) => formatMoney(v) },
    {
      key: 'voided',
      header: t('salesColumns.status'),
      format: (v, r) =>
        v
          ? t('salesColumns.voided')
          : r.returnStatus && r.returnStatus !== 'none'
            ? t('salesColumns.returned', { status: r.returnStatus })
            : t('common:status.paid'),
    },
  ];
  const handleExportCSV = () =>
    exportCSV(
      summaryRows,
      [
        { key: 'metric', header: t('export.metric') },
        { key: 'value', header: t('export.value') },
      ],
      `dashboard-${range}`
    );
  const handleExportPDF = () =>
    exportPDF({
      title: t('export.title'),
      filename: `dashboard-${range}`,
      columns: salesColumns,
      rows: recentSales,
      meta: {
        pharmacy: activePharmacy?.name,
        period: period.rangeLabel,
        generatedBy: user?.name,
        subtitle: t('export.subtitle'),
        summary: summaryRows.map((r) => [r.metric, r.value]),
      },
    });
  const handleExportSalesXlsx = async () => {
    setExportingSales(true);
    try {
      await downloadExport('sales', { format: 'xlsx', range });
    } catch (err) {
      logApiError('Sales export failed', err);
    } finally {
      setExportingSales(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in">
      {/* 1. TOP EXECUTIVE KPI CARDS ROW */}
      <DashboardToolbar
        range={range}
        onRangeChange={setRange}
        onExportCSV={handleExportCSV}
        onExportPDF={handleExportPDF}
        canExportSales={can('data:export')}
        exportingSales={exportingSales}
        onExportSalesXlsx={handleExportSalesXlsx}
      />

      {/* First-run setup checklist (owners only, until complete or dismissed) */}
      {can('settings:manage') && <OnboardingChecklist />}

      <KpiCards kpis={kpis} period={period} revenueVsExpenses={revenueVsExpenses} />

      {/* 2. SALES LEDGER & FINANCIAL TRAJECTORY (Row 2) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <RecentSalesCard recentSales={recentSales} onOpenReceipt={handleOpenReceipt} />
        <SalesTrendChart revenueVsExpenses={revenueVsExpenses} grossProfit={period.grossProfit ?? kpis.netProfit} />
      </div>

      {/* 3. FEFO & PROCUREMENT LIFECYCLE (Row 3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ExpiryHealthCard batchOverview={batchOverview} />
        <TopSuppliersCard topSuppliers={topSuppliers} />
        <AnomalyAlertsCard operationalTasks={operationalTasks} tasksState={tasksState} onToggleTask={toggleTask} />
      </div>

      {/* Invoice Receipt Modal */}
      {selectedSale && (
        <InvoiceReceiptModal isOpen={isReceiptOpen} onClose={() => setIsReceiptOpen(false)} sale={selectedSale} />
      )}
    </div>
  );
};

export default PharmacistDashboard;
