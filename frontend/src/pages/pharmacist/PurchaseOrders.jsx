import { useState, useEffect, useCallback, Fragment } from 'react';
import {
  ShoppingCart,
  Plus,
  Search,
  Truck,
  Building2,
  DollarSign,
  Clock,
  XCircle,
  Send,
  Ban,
  History,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  getPurchaseOrders,
  cancelPurchaseOrder,
  submitPurchaseOrder,
  closePurchaseOrder,
} from '../../api/procurementApi';
import Can from '../../components/common/Can';
import { formatMoney, formatDate } from '../../utils/format';
import CreatePOModal from './CreatePOModal';
import ReceivePOModal from './ReceivePOModal';
import MetricCard from '../../components/common/MetricCard';
import StatusBadge from '../../components/common/StatusBadge';
import { CardSkeleton } from '../../components/common/SkeletonLoader';

const STATUS_FILTERS = [
  { value: '', label: 'All Orders' },
  { value: 'draft', label: 'Drafts' },
  { value: 'ordered', label: 'Pending Delivery' },
  { value: 'partially_received', label: 'Partial' },
  { value: 'received', label: 'Received' },
  { value: 'closed', label: 'Closed Short' },
  { value: 'cancelled', label: 'Cancelled' },
];

const statusBadgeProps = (status) => {
  switch (status) {
    case 'ordered':
      return { status: 'ordered', label: 'Pending Delivery' };
    case 'partially_received':
      return { status: 'warning', label: 'Partially Received' };
    case 'closed':
      return { status: 'depleted', label: 'Closed Short' };
    default:
      return { status };
  }
};

// Line progress and receipt (GRN) history for one order.
const PODetails = ({ po }) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
    <div>
      <h4 className="font-bold text-slate-900 dark:text-white mb-2">Lines</h4>
      <table className="w-full text-left">
        <thead className="text-[10px] uppercase tracking-wider text-slate-400">
          <tr>
            <th className="py-1 pr-2">Item</th>
            <th className="py-1 px-2 text-right">Ordered</th>
            <th className="py-1 px-2 text-right">Received</th>
            <th className="py-1 px-2 text-right">Bonus</th>
            <th className="py-1 pl-2 text-right">Unit cost</th>
          </tr>
        </thead>
        <tbody className="font-mono text-slate-700 dark:text-slate-300">
          {po.items?.map((it) => {
            // Orders received before partial receiving existed have no per-line counts.
            const received =
              po.status === 'received' && !it.quantityReceived ? it.quantityOrdered : it.quantityReceived || 0;
            return (
              <tr key={it._id || it.medicineId} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1 pr-2 font-sans">{it.name}</td>
                <td className="py-1 px-2 text-right">{it.quantityOrdered}</td>
                <td
                  className={`py-1 px-2 text-right ${
                    received < it.quantityOrdered ? 'text-amber-600 dark:text-amber-400' : ''
                  }`}
                >
                  {received}
                </td>
                <td className="py-1 px-2 text-right">{it.bonusQuantity || 0}</td>
                <td className="py-1 pl-2 text-right">{formatMoney(it.unitCost)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {po.status === 'closed' && (
        <p className="mt-2 text-[11px] text-slate-500">
          Closed short{po.closeReason ? `: ${po.closeReason}` : ''}
        </p>
      )}
    </div>
    <div>
      <h4 className="font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
        <History className="w-3.5 h-3.5" /> Receipt history
      </h4>
      {!po.receipts || po.receipts.length === 0 ? (
        <p className="text-slate-400">No deliveries recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {po.receipts.map((r) => (
            <div
              key={r._id || r.receiptNo}
              className="p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-900/40"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono font-bold text-slate-900 dark:text-white">{r.receiptNo}</span>
                <span className="text-[11px] text-slate-500">
                  {formatDate(r.date)}
                  {r.receivedBy?.name ? ` by ${r.receivedBy.name}` : ''}
                </span>
              </div>
              {r.supplierInvoiceNo && (
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Supplier invoice <span className="font-mono">{r.supplierInvoiceNo}</span>
                  {r.supplierInvoiceDate ? ` (${formatDate(r.supplierInvoiceDate)})` : ''}
                </p>
              )}
              <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                {r.lines?.map((l, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>
                      {l.name} <span className="font-mono text-slate-400">#{l.batchNo}</span>
                    </span>
                    <span className="font-mono">
                      {l.quantity}
                      {l.bonusQuantity ? ` + ${l.bonusQuantity} bonus` : ''}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-right text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-200 mt-1">
                {formatMoney(r.totalCost)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

const PurchaseOrders = () => {
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
    if (!window.confirm(`Are you sure you want to cancel purchase order "${poNumber}"?`)) {
      return;
    }

    setCancellingId(id);
    try {
      await cancelPurchaseOrder(id);
      await loadOrders();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to cancel order');
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
      alert(err.response?.data?.message || 'Failed to submit order');
    } finally {
      setBusyId(null);
    }
  };

  const handleCloseShort = async (po) => {
    const reason = window.prompt(
      `Close "${po.poNumber}" short? The remaining quantities will be marked as not coming.\nReason (optional):`,
      ''
    );
    if (reason === null) return;
    setBusyId(po._id);
    try {
      await closePurchaseOrder(po._id, reason);
      await loadOrders();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to close order');
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
              Procurement & Supply Chain
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">
            Purchase Orders & Deliveries
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Procure inventory replenishment batches from pharmaceutical vendors and receive inbound lots
          </p>
        </div>

        <Can perm="po:manage">
        <button
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer self-start sm:self-auto shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Create Purchase Order</span>
        </button>
        </Can>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <MetricCard
          title="Total Requisitions"
          value={totalOrders.toString()}
          subValue="All generated purchase orders"
          badgeText="Total POs"
          badgeVariant="emerald"
          icon={<ShoppingCart className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
          sparklineData={[10, 14, 12, 18, 16, 22, 25, totalOrders]}
          sparklineColor="#10b981"
          sparklineId="total-po-spark"
        />

        <MetricCard
          title="Pending Deliveries"
          value={pendingOrders.toString()}
          subValue="Awaiting vendor receipt"
          badgeText={pendingOrders > 0 ? 'In Transit' : 'Clear'}
          badgeVariant="amber"
          icon={<Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
          sparklineData={[4, 6, 5, 8, 7, 9, 6, pendingOrders]}
          sparklineColor="#f59e0b"
          sparklineId="pending-po-spark"
        />

        <MetricCard
          title="Received Deliveries"
          value={receivedOrders.toString()}
          subValue="Deposited to active stock"
          badgeText="Fulfilled"
          badgeVariant="emerald"
          icon={<Truck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
          sparklineData={[6, 9, 8, 12, 14, 16, 18, receivedOrders]}
          sparklineColor="#10b981"
          sparklineId="received-po-spark"
        />

        <MetricCard
          title="Procurement Spend"
          value={formatMoney(totalProcurementSpend)}
          subValue="Active replenishment capital"
          badgeText="Capital"
          badgeVariant="indigo"
          icon={<DollarSign className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
          sparklineData={[800, 1200, 1100, 1600, 1900, 2400, totalProcurementSpend]}
          sparklineColor="#6366f1"
          sparklineId="spend-po-spark"
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-[#161c26] border border-slate-100/90 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by PO number or supplier name..."
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
                {f.label}
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
              Clear
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
                {search || statusFilter ? 'No matching purchase orders' : 'No purchase orders drafted'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                {search || statusFilter
                  ? 'Try adjusting your search criteria or filter tags'
                  : 'Draft a purchase order to request pharmaceutical inventory from registered suppliers'}
              </p>
              <button
                onClick={() => setIsCreateOpen(true)}
                className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Create First PO
              </button>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800 text-[11px]">
                <tr>
                  <th className="py-3.5 pl-3 pr-0 w-6"></th>
                  <th className="py-3.5 px-5">PO Identification</th>
                  <th className="py-3.5 px-4">Pharmaceutical Vendor</th>
                  <th className="py-3.5 px-4">Order Date</th>
                  <th className="py-3.5 px-4">Requisition Summary</th>
                  <th className="py-3.5 px-4">Order Total</th>
                  <th className="py-3.5 px-4">Delivery Status</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80 dark:divide-slate-800/60 font-medium">
                {orders.map((po) => (
                  <Fragment key={po._id}>
                  <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition group">
                    <td className="py-3.5 pl-3 pr-0 align-top">
                      <button
                        onClick={() => setExpandedId(expandedId === po._id ? null : po._id)}
                        className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded cursor-pointer"
                        title="Show lines and receipt history"
                      >
                        {expandedId === po._id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className="font-mono font-bold text-slate-900 dark:text-white block group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                        {po.poNumber}
                      </span>
                      {po.notes && (
                        <span className="text-[10px] text-slate-400 truncate max-w-xs block">
                          {po.notes}
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white block">
                            {po.supplierId?.name || 'Verified Supplier'}
                          </span>
                          {po.supplierId?.phone && (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                              {po.supplierId.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 font-mono">
                      <div>
                        <span>{new Date(po.orderDate).toLocaleDateString()}</span>
                        {po.expectedDelivery && (
                          <span className="text-[10px] text-slate-400 block">
                            Expected: {new Date(po.expectedDelivery).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="text-slate-900 dark:text-white font-medium block">
                        {po.items?.length || 0} product{po.items?.length > 1 ? 's' : ''} (
                        {po.items?.reduce((sum, it) => sum + it.quantityOrdered, 0)} units)
                      </span>
                      {(po.status === 'partially_received' || po.status === 'closed') && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono block">
                          Received {po.items?.reduce((s2, it) => s2 + (it.quantityReceived || 0), 0)} of{' '}
                          {po.items?.reduce((s2, it) => s2 + it.quantityOrdered, 0)}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 truncate max-w-xs block">
                        {po.items?.map((it) => `${it.name} (x${it.quantityOrdered})`).join(', ')}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white text-sm">
                      {formatMoney(po.totalAmount)}
                    </td>

                    <td className="py-3.5 px-4">
                      <StatusBadge {...statusBadgeProps(po.status)} />
                    </td>

                    <td className="py-3.5 px-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {po.status === 'draft' && (
                          <Can perm="po:manage">
                            <button
                              onClick={() => handleSubmitDraft(po._id)}
                              disabled={busyId === po._id}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-[11px] font-semibold transition cursor-pointer shadow-xs"
                            >
                              <Send className="w-3 h-3" /> Submit
                            </button>
                          </Can>
                        )}
                        {(po.status === 'ordered' || po.status === 'partially_received') && (
                          <Can perm="po:receive">
                            <button
                              onClick={() => handleOpenReceive(po)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-semibold transition cursor-pointer shadow-xs"
                            >
                              <Truck className="w-3 h-3" /> {po.status === 'ordered' ? 'Receive Stock' : 'Receive More'}
                            </button>
                          </Can>
                        )}
                        {po.status === 'partially_received' && (
                          <Can perm="po:manage">
                            <button
                              onClick={() => handleCloseShort(po)}
                              disabled={busyId === po._id}
                              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded-lg transition disabled:opacity-40 cursor-pointer"
                              title="Close short (remaining will not be delivered)"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          </Can>
                        )}
                        {(po.status === 'draft' || po.status === 'ordered') && (
                          <Can perm="po:manage">
                            <button
                              onClick={() => handleCancel(po._id, po.poNumber)}
                              disabled={cancellingId === po._id}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition disabled:opacity-40 cursor-pointer"
                              title="Cancel Purchase Order"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </Can>
                        )}
                        {po.status === 'received' && (
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">
                            Received {po.receivedDate ? formatDate(po.receivedDate) : ''}
                          </span>
                        )}
                        {po.status === 'closed' && (
                          <span className="text-[11px] text-slate-500 font-mono">
                            Closed {po.closedAt ? formatDate(po.closedAt) : ''}
                          </span>
                        )}
                        {po.status === 'cancelled' && (
                          <span className="text-[11px] text-rose-500 font-mono">Cancelled</span>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedId === po._id && (
                    <tr className="bg-slate-50/60 dark:bg-slate-800/30">
                      <td colSpan={8} className="px-5 py-4">
                        <PODetails po={po} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer Summary */}
        {orders.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-800/20">
            <span>
              Showing <strong>{orders.length}</strong> purchase orders
            </span>
            <span className="font-mono text-[11px]">
              Procurement Spend: {formatMoney(totalProcurementSpend)}
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
