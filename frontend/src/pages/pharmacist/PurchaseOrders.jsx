import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getPurchaseOrders, cancelPurchaseOrder } from '../../api/procurementApi';
import CreatePOModal from './CreatePOModal';
import ReceivePOModal from './ReceivePOModal';

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
    }, 300);
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

  // Summary Metrics
  const totalOrders = orders.length;
  const pendingOrders = orders.filter((o) => o.status === 'ordered').length;
  const receivedOrders = orders.filter((o) => o.status === 'received').length;
  const totalProcurementSpend = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.totalAmount, 0);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 selection:bg-emerald-500 selection:text-white">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-800 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link
                to="/pharmacy"
                className="text-xs text-slate-400 hover:text-emerald-400 transition"
              >
                ← Dashboard
              </Link>
              <span className="text-slate-600">•</span>
              <Link
                to="/pharmacy/suppliers"
                className="text-xs text-slate-400 hover:text-emerald-400 transition"
              >
                Suppliers Directory
              </Link>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Procurement & Purchase Orders</h1>
            <p className="text-xs text-slate-400">
              Procure stock from pharmaceutical vendors and receive deliveries directly into active inventory
            </p>
          </div>

          <button
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-md transition cursor-pointer self-start sm:self-auto"
          >
            <span className="text-base leading-none font-bold">+</span> Create Purchase Order
          </button>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
              Total Orders
            </span>
            <p className="text-2xl font-bold text-white font-mono">{totalOrders}</p>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
              Pending Delivery
            </span>
            <p className="text-2xl font-bold text-blue-400 font-mono">{pendingOrders}</p>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
              Received Deliveries
            </span>
            <p className="text-2xl font-bold text-emerald-400 font-mono">{receivedOrders}</p>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
              Procurement Spend
            </span>
            <p className="text-2xl font-bold text-emerald-400 font-mono">
              ${totalProcurementSpend.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-slate-800 border border-slate-700/80 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="w-full sm:w-80">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by PO number..."
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
              <option value="">All Orders</option>
              <option value="ordered">Pending Delivery</option>
              <option value="received">Received</option>
              <option value="cancelled">Cancelled</option>
            </select>

            {(search || statusFilter) && (
              <button
                onClick={() => {
                  setSearch('');
                  setStatusFilter('');
                }}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 transition cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Purchase Orders Table */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center text-xs text-slate-400">Loading procurement orders...</div>
            ) : orders.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm font-semibold text-slate-300 mb-1">
                  {search || statusFilter ? 'No matching purchase orders found' : 'No purchase orders yet'}
                </p>
                <p className="text-xs text-slate-500 mb-4">
                  {search || statusFilter
                    ? 'Try different search filters.'
                    : 'Issue purchase orders to restock medicines directly from vendors.'}
                </p>
                <button
                  onClick={() => setIsCreateOpen(true)}
                  className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  + Create First Purchase Order
                </button>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-700/60">
                  <tr>
                    <th className="py-3 px-4">PO Number</th>
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-4">Order Date</th>
                    <th className="py-3 px-4">Items Summary</th>
                    <th className="py-3 px-4">Total Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {orders.map((po) => (
                    <tr key={po._id} className="hover:bg-slate-700/30 transition">
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-blue-400 block">{po.poNumber}</span>
                        {po.notes && <span className="text-[10px] text-slate-500 truncate max-w-xs">{po.notes}</span>}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-white block">
                          {po.supplierId?.name || 'Unknown Supplier'}
                        </span>
                        {po.supplierId?.phone && (
                          <span className="text-[11px] text-slate-400 font-mono">{po.supplierId.phone}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-300 font-mono">
                        {new Date(po.orderDate).toLocaleDateString()}
                        {po.expectedDelivery && (
                          <span className="text-[10px] text-slate-500 block">
                            Expected: {new Date(po.expectedDelivery).toLocaleDateString()}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-white font-medium">
                          {po.items?.length || 0} product{po.items?.length > 1 ? 's' : ''} (
                          {po.items?.reduce((sum, it) => sum + it.quantityOrdered, 0)} units)
                        </span>
                        <span className="text-[10px] text-slate-500 block truncate max-w-xs">
                          {po.items?.map((it) => `${it.name} (x${it.quantityOrdered})`).join(', ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-400 text-sm">
                        ${po.totalAmount.toFixed(2)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            po.status === 'received'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : po.status === 'ordered'
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {po.status === 'ordered' ? 'Pending Delivery' : po.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        {po.status === 'ordered' && (
                          <>
                            <button
                              onClick={() => handleOpenReceive(po)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-semibold transition cursor-pointer shadow"
                            >
                              Receive Stock
                            </button>
                            <button
                              onClick={() => handleCancel(po._id, po.poNumber)}
                              disabled={cancellingId === po._id}
                              className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded text-[11px] font-medium transition cursor-pointer"
                            >
                              {cancellingId === po._id ? 'Cancelling...' : 'Cancel'}
                            </button>
                          </>
                        )}
                        {po.status === 'received' && (
                          <span className="text-[11px] text-emerald-400/80 font-mono">
                            Received {po.receivedDate ? new Date(po.receivedDate).toLocaleDateString() : ''}
                          </span>
                        )}
                        {po.status === 'cancelled' && (
                          <span className="text-[11px] text-rose-400/70 font-mono">Cancelled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
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
