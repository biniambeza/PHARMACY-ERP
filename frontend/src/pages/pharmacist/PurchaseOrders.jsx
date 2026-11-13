import { useState, useEffect, useCallback } from 'react';
import { ShoppingCart, Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  getPurchaseOrders,
  cancelPurchaseOrder,
  submitPurchaseOrder,
  closePurchaseOrder,
} from '../../api/procurementApi';
import Can from '../../components/common/Can';
import { formatMoney } from '../../utils/format';
import CreatePOModal from './CreatePOModal';
import ReceivePOModal from './ReceivePOModal';
import { CardSkeleton } from '../../components/common/SkeletonLoader';
import POMetrics from '../../components/procurement/POMetrics';
import POTableRow from '../../components/procurement/POTableRow';

const STATUS_FILTERS = [
  { value: '', labelKey: 'filters.all' },
  { value: 'draft', labelKey: 'filters.draft' },
  { value: 'ordered', labelKey: 'filters.ordered' },
  { value: 'partially_received', labelKey: 'filters.partial' },
  { value: 'received', labelKey: 'filters.received' },
  { value: 'closed', labelKey: 'filters.closed' },
  { value: 'cancelled', labelKey: 'filters.cancelled' },
];

const PurchaseOrders = () => {
  const { t } = useTranslation('procurement');
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const loadOrders = useCallback(async () => {
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;

      const data = await getPurchaseOrders(params);
      setOrders(data.orders || []);
    } catch (err) {
      console.error('Failed to load purchase orders:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadOrders();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadOrders]);

  const handleOpenReceive = (order) => {
    setSelectedOrder(order);
    setIsReceiveOpen(true);
  };

  const handleCancel = async (id, poNumber) => {
    if (!window.confirm(t('confirm.cancel', { poNumber }))) {
      return;
    }

    setCancellingId(id);
    try {
      await cancelPurchaseOrder(id);
      await loadOrders();
    } catch (err) {
      alert(err.response?.data?.message || t('errors.cancelFailed'));
    } finally {
      setCancellingId(null);
    }
  };

  const handleSubmitDraft = async (id) => {
    setBusyId(id);
    try {
      await submitPurchaseOrder(id);
      await loadOrders();
    } catch (err) {
      alert(err.response?.data?.message || t('errors.submitFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const handleCloseShort = async (po) => {
    const reason = window.prompt(t('confirm.closeShort', { poNumber: po.poNumber }), '');
    if (reason === null) return;
    setBusyId(po._id);
    try {
      await closePurchaseOrder(po._id, reason);
      await loadOrders();
    } catch (err) {
      alert(err.response?.data?.message || t('errors.closeFailed'));
    } finally {
      setBusyId(null);
    }
  };

  // Metrics
  const totalOrders = orders.length;
  const pendingOrders = orders.filter((o) => o.status === 'ordered' || o.status === 'partially_received').length;
  const receivedOrders = orders.filter((o) => o.status === 'received' || o.status === 'closed').length;
  const totalProcurementSpend = orders
    .filter((o) => o.status !== 'cancelled' && o.status !== 'draft')
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

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

        <Can perm="po:manage">
        <button
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer self-start sm:self-auto shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{t('page.create')}</span>
        </button>
        </Can>
      </div>

      {/* Metrics Cards */}
      <POMetrics
        totalOrders={totalOrders}
        pendingOrders={pendingOrders}
        receivedOrders={receivedOrders}
        totalProcurementSpend={totalProcurementSpend}
      />

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-[#161c26] border border-slate-100/90 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('page.searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-medium">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value || 'all'}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
                  statusFilter === f.value
                    ? 'bg-white dark:bg-[#161c26] text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t(f.labelKey)}
              </button>
            ))}
          </div>

          {(search || statusFilter) && (
            <button
              onClick={() => {
                setSearch('');
                setStatusFilter('');
              }}
              className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition font-medium cursor-pointer"
            >
              {t('common:buttons.clear')}
            </button>
          )}
        </div>
      </div>

      {/* Purchase Orders Table Container */}
      <div className="bg-white dark:bg-[#161c26] border border-slate-100/90 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8">
              <CardSkeleton height="h-64" />
            </div>
          ) : orders.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3 border border-emerald-100 dark:border-emerald-900/50">
                <ShoppingCart className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {search || statusFilter ? t('empty.noMatchTitle') : t('empty.noneTitle')}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                {search || statusFilter ? t('empty.noMatchHint') : t('empty.noneHint')}
              </p>
              <button
                onClick={() => setIsCreateOpen(true)}
                className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> {t('empty.createFirst')}
              </button>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800 text-[11px]">
                <tr>
                  <th className="py-3.5 pl-3 pr-0 w-6"></th>
                  <th className="py-3.5 px-5">{t('table.poId')}</th>
                  <th className="py-3.5 px-4">{t('table.vendor')}</th>
                  <th className="py-3.5 px-4">{t('table.orderDate')}</th>
                  <th className="py-3.5 px-4">{t('table.summary')}</th>
                  <th className="py-3.5 px-4">{t('table.orderTotal')}</th>
                  <th className="py-3.5 px-4">{t('table.deliveryStatus')}</th>
                  <th className="py-3.5 px-5 text-right">{t('common:labels.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80 dark:divide-slate-800/60 font-medium">
                {orders.map((po) => (
                  <POTableRow
                    key={po._id}
                    po={po}
                    expanded={expandedId === po._id}
                    onToggle={() => setExpandedId(expandedId === po._id ? null : po._id)}
                    busyId={busyId}
                    cancellingId={cancellingId}
                    onSubmitDraft={handleSubmitDraft}
                    onReceive={handleOpenReceive}
                    onCloseShort={handleCloseShort}
                    onCancel={handleCancel}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer Summary */}
        {orders.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-800/20">
            <span>
              {t('footer.showingPrefix')} <strong>{orders.length}</strong> {t('footer.showingSuffix')}
            </span>
            <span className="font-mono text-[11px]">
              {t('footer.spend', { amount: formatMoney(totalProcurementSpend) })}
            </span>
          </div>
        )}
      </div>

      {/* Create Purchase Order Modal */}
      <CreatePOModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={loadOrders}
      />

      {/* Receive Purchase Order Modal */}
      <ReceivePOModal
        isOpen={isReceiveOpen}
        onClose={() => {
          setIsReceiveOpen(false);
          setSelectedOrder(null);
        }}
        onSuccess={loadOrders}
        order={selectedOrder}
      />
    </div>
  );
};

export default PurchaseOrders;
