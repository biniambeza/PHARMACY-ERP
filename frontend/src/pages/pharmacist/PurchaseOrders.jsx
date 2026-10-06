import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingCart,
  Plus,
  Search,
  Truck,
  Building2,
  Calendar,
  DollarSign,
  PackageCheck,
  Clock,
  XCircle,
  FileText,
} from 'lucide-react';
import { getPurchaseOrders, cancelPurchaseOrder } from '../../api/procurementApi';
import CreatePOModal from './CreatePOModal';
import ReceivePOModal from './ReceivePOModal';
import MetricCard from '../../components/common/MetricCard';
import StatusBadge from '../../components/common/StatusBadge';
import { CardSkeleton } from '../../components/common/SkeletonLoader';

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

  // Metrics
  const totalOrders = orders.length;
  const pendingOrders = orders.filter((o) => o.status === 'ordered').length;
  const receivedOrders = orders.filter((o) => o.status === 'received').length;
  const totalProcurementSpend = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/50 px-2.5 py-0.5 rounded-full border border-teal-200 dark:border-teal-800/60 uppercase tracking-wider">
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

        <button
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer self-start sm:self-auto shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Create Purchase Order</span>
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <MetricCard
          title="Total Requisitions"
          value={totalOrders.toString()}
          subValue="All generated purchase orders"
          badgeText="Total POs"
          badgeVariant="teal"
          icon={<ShoppingCart className="w-4 h-4 text-teal-600 dark:text-teal-400" />}
          sparklineData={[10, 14, 12, 18, 16, 22, 25, totalOrders]}
          sparklineColor="#0d9488"
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
          value={`$${totalProcurementSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
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
            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-medium">
            <button
              onClick={() => setStatusFilter('')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
                statusFilter === ''
                  ? 'bg-white dark:bg-[#161c26] text-teal-600 dark:text-teal-400 font-bold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All Orders
            </button>
            <button
              onClick={() => setStatusFilter('ordered')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
                statusFilter === 'ordered'
                  ? 'bg-white dark:bg-[#161c26] text-amber-600 dark:text-amber-400 font-bold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Pending Delivery
            </button>
            <button
              onClick={() => setStatusFilter('received')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
                statusFilter === 'received'
                  ? 'bg-white dark:bg-[#161c26] text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Received
            </button>
            <button
              onClick={() => setStatusFilter('cancelled')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
                statusFilter === 'cancelled'
                  ? 'bg-white dark:bg-[#161c26] text-rose-600 dark:text-rose-400 font-bold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Cancelled
            </button>
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
              <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 flex items-center justify-center mx-auto mb-3 border border-teal-100 dark:border-teal-900/50">
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
                className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-xl shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Create First PO
              </button>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800 text-[11px]">
                <tr>
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
                  <tr key={po._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition group">
                    <td className="py-3.5 px-5">
                      <span className="font-mono font-bold text-slate-900 dark:text-white block group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
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
                      <span className="text-[10px] text-slate-400 truncate max-w-xs block">
                        {po.items?.map((it) => `${it.name} (x${it.quantityOrdered})`).join(', ')}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white text-sm">
                      ${Number(po.totalAmount || 0).toFixed(2)}
                    </td>

                    <td className="py-3.5 px-4">
                      <StatusBadge status={po.status} label={po.status === 'ordered' ? 'Pending Delivery' : po.status} />
                    </td>

                    <td className="py-3.5 px-5 text-right space-x-2">
                      {po.status === 'ordered' && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenReceive(po)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-[11px] font-semibold transition cursor-pointer shadow-xs"
                          >
                            <Truck className="w-3 h-3" /> Receive Stock
                          </button>
                          <button
                            onClick={() => handleCancel(po._id, po.poNumber)}
                            disabled={cancellingId === po._id}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition disabled:opacity-40 cursor-pointer"
                            title="Cancel Purchase Order"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      {po.status === 'received' && (
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">
                          Received {po.receivedDate ? new Date(po.receivedDate).toLocaleDateString() : ''}
                        </span>
                      )}
                      {po.status === 'cancelled' && (
                        <span className="text-[11px] text-rose-500 font-mono">Cancelled</span>
                      )}
                    </td>
                  </tr>
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
              Procurement Spend: ${totalProcurementSpend.toFixed(2)}
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
