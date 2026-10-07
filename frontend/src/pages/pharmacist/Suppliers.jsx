import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Plus,
  Search,
  Phone,
  Mail,
  MapPin,
  User,
  Edit3,
  Trash2,
  CheckCircle,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { getSuppliers, deleteSupplier } from '../../api/supplierApi';
import SupplierModal from './SupplierModal';
import MetricCard from '../../components/common/MetricCard';
import StatusBadge from '../../components/common/StatusBadge';
import { CardSkeleton } from '../../components/common/SkeletonLoader';

const Suppliers = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const loadSuppliers = useCallback(async () => {
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;

      const data = await getSuppliers(params);
      setSuppliers(data.suppliers || []);
    } catch (err) {
      console.error('Failed to load suppliers:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadSuppliers();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadSuppliers]);

  const handleEdit = (supplier) => {
    setSelectedSupplier(supplier);
    setIsModalOpen(true);
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete supplier "${name}"?`)) {
      return;
    }

    setDeletingId(id);
    try {
      await deleteSupplier(id);
      await loadSuppliers();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete supplier');
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenCreate = () => {
    setSelectedSupplier(null);
    setIsModalOpen(true);
  };

  // Metrics
  const totalSuppliers = suppliers.length;
  const activeSuppliers = suppliers.filter((s) => s.status === 'active').length;
  const inactiveSuppliers = totalSuppliers - activeSuppliers;

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 uppercase tracking-wider">
              Vendor Directory
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">
            Pharmaceutical Suppliers Directory
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage medicine distributors, verified manufacturers, and supply contract contacts
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer self-start sm:self-auto shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Supplier</span>
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        <MetricCard
          title="Total Registered Vendors"
          value={totalSuppliers.toString()}
          subValue="Active & historical suppliers"
          badgeText="Directory"
          badgeVariant="emerald"
          icon={<Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
          sparklineData={[4, 6, 8, 9, 12, 11, totalSuppliers]}
          sparklineColor="#10b981"
          sparklineId="total-sup-spark"
        />

        <MetricCard
          title="Active Contract Vendors"
          value={activeSuppliers.toString()}
          subValue="Available for procurement"
          badgeText="Active"
          badgeVariant="emerald"
          icon={<CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
          sparklineData={[3, 5, 7, 8, 10, activeSuppliers]}
          sparklineColor="#10b981"
          sparklineId="active-sup-spark"
        />

        <MetricCard
          title="Inactive / Suspended"
          value={inactiveSuppliers.toString()}
          subValue="Suspended trade accounts"
          badgeText={inactiveSuppliers > 0 ? 'Under Review' : 'Zero Suspensions'}
          badgeVariant={inactiveSuppliers > 0 ? 'amber' : 'emerald'}
          icon={<AlertCircle className="w-4 h-4 text-amber-500" />}
          sparklineData={[1, 0, 2, 1, 0, inactiveSuppliers]}
          sparklineColor="#f59e0b"
          sparklineId="inact-sup-spark"
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
            placeholder="Search by vendor name, contact person, phone, or email..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-medium">
            <button
              onClick={() => setStatusFilter('')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
                statusFilter === ''
                  ? 'bg-white dark:bg-[#161c26] text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All Vendors
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
                statusFilter === 'active'
                  ? 'bg-white dark:bg-[#161c26] text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Active Only
            </button>
            <button
              onClick={() => setStatusFilter('inactive')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
                statusFilter === 'inactive'
                  ? 'bg-white dark:bg-[#161c26] text-amber-600 dark:text-amber-400 font-bold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Inactive
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

      {/* Suppliers Table Container */}
      <div className="bg-white dark:bg-[#161c26] border border-slate-100/90 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8">
              <CardSkeleton height="h-64" />
            </div>
          ) : suppliers.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3 border border-emerald-100 dark:border-emerald-900/50">
                <Building2 className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {search || statusFilter ? 'No matching vendors found' : 'No suppliers registered'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                {search || statusFilter
                  ? 'Try modifying your search query or filter tags'
                  : 'Add authorized pharmaceutical distributors to begin issuing purchase orders'}
              </p>
              <button
                onClick={handleOpenCreate}
                className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add First Supplier
              </button>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800 text-[11px]">
                <tr>
                  <th className="py-3.5 px-5">Vendor Company</th>
                  <th className="py-3.5 px-4">Account Representative</th>
                  <th className="py-3.5 px-4">Telephone</th>
                  <th className="py-3.5 px-4">Email Address</th>
                  <th className="py-3.5 px-4">Warehouse Address</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80 dark:divide-slate-800/60 font-medium">
                {suppliers.map((item) => (
                  <tr key={item._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition group">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900/50">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white block group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                            {item.name}
                          </span>
                          {item.notes && (
                            <span className="text-[10px] text-slate-400 truncate max-w-xs block">
                              {item.notes}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      {item.contactPerson ? (
                        <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{item.contactPerson}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Not specified</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 font-mono">
                      {item.phone || 'N/A'}
                    </td>

                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                      {item.email ? (
                        <span className="hover:underline">{item.email}</span>
                      ) : (
                        <span className="text-slate-400 italic">N/A</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 max-w-xs truncate">
                      {item.address || 'N/A'}
                    </td>

                    <td className="py-3.5 px-4">
                      <StatusBadge status={item.status} label={item.status === 'active' ? 'Active' : 'Inactive'} />
                    </td>

                    <td className="py-3.5 px-5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleEdit(item)}
                          title="Edit supplier"
                          className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-emerald-400 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(item._id, item.name)}
                          disabled={deletingId === item._id}
                          title="Delete supplier"
                          className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 dark:text-slate-400 dark:hover:text-rose-400 dark:hover:bg-rose-950/30 rounded-lg transition disabled:opacity-40 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer Summary */}
        {suppliers.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-800/20">
            <span>
              Showing <strong>{suppliers.length}</strong> registered distributors
            </span>
            <span className="font-mono text-[11px]">
              Directory ID: SUP-DIR-{suppliers.length}
            </span>
          </div>
        )}
      </div>

      {/* Supplier Modal */}
      <SupplierModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedSupplier(null);
        }}
        onSuccess={loadSuppliers}
        supplier={selectedSupplier}
      />
    </div>
  );
};

export default Suppliers;
