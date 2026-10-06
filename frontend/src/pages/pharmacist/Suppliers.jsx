import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getSuppliers, deleteSupplier } from '../../api/supplierApi';
import SupplierModal from './SupplierModal';

const Suppliers = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const loadSuppliers = useCallback(async () => {
    try {
      const params = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;

      const data = await getSuppliers(params);
      setSuppliers(data.suppliers || []);
    } catch (err) {
      console.error('Failed to load suppliers:', err);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadSuppliers();
    }, 300);
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
                to="/pharmacy/procurement"
                className="text-xs text-slate-400 hover:text-emerald-400 transition"
              >
                Purchase Orders
              </Link>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Suppliers Directory</h1>
            <p className="text-xs text-slate-400">
              Manage medicine distributors, pharmaceutical manufacturers, and procurement contacts
            </p>
          </div>

          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-md transition cursor-pointer self-start sm:self-auto"
          >
            <span className="text-base leading-none font-bold">+</span> Add Supplier
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-slate-800 border border-slate-700/80 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="w-full sm:w-80">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by company, contact person, or phone..."
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="w-full sm:w-auto flex items-center gap-3">
            <label className="text-xs text-slate-400 hidden sm:inline">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full sm:w-36 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive</option>
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

        {/* Suppliers Table */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center text-xs text-slate-400">Loading suppliers directory...</div>
            ) : suppliers.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm font-semibold text-slate-300 mb-1">
                  {search || statusFilter ? 'No matching suppliers found' : 'No suppliers registered yet'}
                </p>
                <p className="text-xs text-slate-500 mb-4">
                  {search || statusFilter
                    ? 'Try adjusting your search criteria.'
                    : 'Register your pharmaceutical distributors to issue purchase orders.'}
                </p>
                <button
                  onClick={handleOpenCreate}
                  className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  + Add First Supplier
                </button>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-700/60">
                  <tr>
                    <th className="py-3 px-4">Company Name</th>
                    <th className="py-3 px-4">Contact Person</th>
                    <th className="py-3 px-4">Phone & Email</th>
                    <th className="py-3 px-4">Address</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {suppliers.map((s) => (
                    <tr key={s._id} className="hover:bg-slate-700/30 transition">
                      <td className="py-3 px-4">
                        <span className="font-bold text-white block">{s.name}</span>
                        {s.notes && <span className="text-[11px] text-slate-400 italic">{s.notes}</span>}
                      </td>
                      <td className="py-3 px-4 text-slate-300">
                        {s.contactPerson || <span className="text-slate-500 italic">Not specified</span>}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-emerald-400 block">{s.phone}</span>
                        {s.email && <span className="text-[11px] text-slate-400">{s.email}</span>}
                      </td>
                      <td className="py-3 px-4 text-slate-300 max-w-xs truncate">
                        {s.address || <span className="text-slate-500 italic">—</span>}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            s.status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-slate-700 text-slate-400'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => handleEdit(s)}
                          className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[11px] font-medium transition cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(s._id, s.name)}
                          disabled={deletingId === s._id}
                          className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded text-[11px] font-medium transition cursor-pointer"
                        >
                          {deletingId === s._id ? 'Deleting...' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
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
