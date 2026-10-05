import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getMedicines, getCategories, deleteMedicine } from '../../api/medicineApi';
import MedicineModal from './MedicineModal';

const Medicines = () => {
  const [medicines, setMedicines] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMedicine, setSelectedMedicine] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const loadMedicines = useCallback(async () => {
    try {
      const params = {};
      if (search) params.search = search;
      if (selectedCategory) params.category = selectedCategory;

      const data = await getMedicines(params);
      setMedicines(data.medicines || []);
    } catch (err) {
      console.error('Failed to load medicines:', err);
    } finally {
      setLoading(false);
    }
  }, [search, selectedCategory]);

  const loadCategories = async () => {
    try {
      const data = await getCategories();
      setCategories(data.categories || []);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadMedicines();
    }, 300);
    return () => clearTimeout(timer);
  }, [loadMedicines]);

  const handleEdit = (medicine) => {
    setSelectedMedicine(medicine);
    setIsModalOpen(true);
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete "${name}" from your catalog?`)) {
      return;
    }

    setDeletingId(id);
    try {
      await deleteMedicine(id);
      await loadMedicines();
      await loadCategories();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete medicine');
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenCreate = () => {
    setSelectedMedicine(null);
    setIsModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 selection:bg-emerald-500 selection:text-white">
      <div className="max-w-6xl mx-auto">
        {/* Breadcrumb / Top Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-800 gap-4 mb-8">
          <div>
            <Link
              to="/pharmacy"
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 mb-2 transition"
            >
              ← Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-white tracking-tight">Medicine Catalog</h1>
            <p className="text-xs text-slate-400">Manage prescription and over-the-counter products for your pharmacy</p>
          </div>

          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-md transition cursor-pointer self-start sm:self-auto"
          >
            <span className="text-base leading-none font-bold">+</span> Add Medicine
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-slate-800 border border-slate-700/80 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 mb-6">
          <div className="w-full sm:w-72">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by brand or generic name..."
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="w-full sm:w-auto flex items-center gap-3">
            <label className="text-xs text-slate-400 hidden sm:inline">Category:</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full sm:w-48 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            {(search || selectedCategory) && (
              <button
                onClick={() => {
                  setSearch('');
                  setSelectedCategory('');
                }}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 transition cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center text-xs text-slate-400">
                Loading medicine catalog...
              </div>
            ) : medicines.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm font-semibold text-slate-300 mb-1">
                  {search || selectedCategory ? 'No matching medicines found' : 'Your catalog is empty'}
                </p>
                <p className="text-xs text-slate-500 mb-4">
                  {search || selectedCategory
                    ? 'Try clearing your search filters.'
                    : 'Start adding medications to build your pharmacy catalog.'}
                </p>
                <button
                  onClick={handleOpenCreate}
                  className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  + Add First Medicine
                </button>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-700/60">
                  <tr>
                    <th className="py-3 px-4">Medicine & Generic</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Form & Strength</th>
                    <th className="py-3 px-4">Retail Price</th>
                    <th className="py-3 px-4">Prescription</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {medicines.map((item) => (
                    <tr key={item._id} className="hover:bg-slate-700/30 transition">
                      <td className="py-3 px-4">
                        <span className="font-semibold text-white block">{item.name}</span>
                        {item.genericName && (
                          <span className="text-[11px] text-slate-400">{item.genericName}</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-slate-900 text-slate-300 border border-slate-700">
                          {item.category}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-slate-200 block">{item.dosageForm}</span>
                        {item.strength && (
                          <span className="text-[11px] text-slate-400 font-mono">{item.strength}</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-bold text-emerald-400 font-mono">
                          ${item.price.toFixed(2)}
                        </span>
                        {item.costPrice > 0 && (
                          <span className="text-[10px] text-slate-500 block font-mono">
                            Cost: ${item.costPrice.toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {item.requiresPrescription ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Rx Required
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500">OTC</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => handleEdit(item)}
                          className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[11px] font-medium transition cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(item._id, item.name)}
                          disabled={deletingId === item._id}
                          className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded text-[11px] font-medium transition cursor-pointer"
                        >
                          {deletingId === item._id ? 'Deleting...' : 'Delete'}
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

      {/* Modal */}
      <MedicineModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedMedicine(null);
        }}
        onSuccess={() => {
          loadMedicines();
          loadCategories();
        }}
        medicine={selectedMedicine}
      />
    </div>
  );
};

export default Medicines;
