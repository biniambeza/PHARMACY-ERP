import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Pill,
  Plus,
  Search,
  Edit3,
  Trash2,
  ShieldAlert,
  ShieldCheck,
  DollarSign,
} from 'lucide-react';
import { getMedicines, getCategories, deleteMedicine } from '../../api/medicineApi';
import MedicineModal from './MedicineModal';
import MetricCard from '../../components/common/MetricCard';
import { CardSkeleton } from '../../components/common/SkeletonLoader';

const Medicines = () => {
  const [medicines, setMedicines] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [rxFilter, setRxFilter] = useState('all'); // 'all' | 'rx' | 'otc'
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
    }, 250);
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

  // Filter medicines by Rx / OTC tab
  const filteredMedicines = useMemo(() => {
    return medicines.filter((m) => {
      if (rxFilter === 'rx') return !!m.requiresPrescription;
      if (rxFilter === 'otc') return !m.requiresPrescription;
      return true;
    });
  }, [medicines, rxFilter]);

  // Executive KPI summary calculations
  const totalProducts = medicines.length;
  const rxCount = medicines.filter((m) => m.requiresPrescription).length;
  const otcCount = totalProducts - rxCount;
  const avgPrice = totalProducts > 0
    ? medicines.reduce((sum, m) => sum + (Number(m.price) || 0), 0) / totalProducts
    : 0;

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/50 px-2.5 py-0.5 rounded-full border border-teal-200 dark:border-teal-800/60 uppercase tracking-wider">
              Dispensary Catalog
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">
            Medicine Catalog & Formulations
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage pharmaceutical items, generic compositions, dispensing schedules, and unit pricing
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer self-start sm:self-auto shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Medicine</span>
        </button>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <MetricCard
          title="Total Formulations"
          value={totalProducts.toString()}
          subValue="Active catalog items"
          badgeText="Catalog"
          badgeVariant="teal"
          icon={<Pill className="w-4 h-4 text-teal-600 dark:text-teal-400" />}
          sparklineData={[15, 18, 22, 25, 29, 32, 38, totalProducts]}
          sparklineColor="#0d9488"
          sparklineId="total-med-spark"
        />

        <MetricCard
          title="Rx Prescription Only"
          value={rxCount.toString()}
          subValue={`${totalProducts > 0 ? Math.round((rxCount / totalProducts) * 100) : 0}% of total inventory`}
          badgeText="Rx Regulated"
          badgeVariant="amber"
          icon={<ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
          sparklineData={[8, 12, 10, 15, 14, 18, 17, rxCount]}
          sparklineColor="#f59e0b"
          sparklineId="rx-med-spark"
        />

        <MetricCard
          title="Over The Counter (OTC)"
          value={otcCount.toString()}
          subValue="Direct patient dispensing"
          badgeText="OTC Active"
          badgeVariant="emerald"
          icon={<ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
          sparklineData={[10, 14, 16, 18, 22, 21, 24, otcCount]}
          sparklineColor="#10b981"
          sparklineId="otc-med-spark"
        />

        <MetricCard
          title="Average Unit Price"
          value={`$${avgPrice.toFixed(2)}`}
          subValue={`Across ${categories.length} categories`}
          badgeText="Pricing"
          badgeVariant="indigo"
          icon={<DollarSign className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
          sparklineData={[20, 24, 21, 27, 26, 31, 29, avgPrice]}
          sparklineColor="#6366f1"
          sparklineId="price-med-spark"
        />
      </div>

      {/* Filter and Controls Toolbar */}
      <div className="bg-white dark:bg-[#161c26] border border-slate-100/90 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by brand name or generic chemical name..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition"
          />
        </div>

        {/* Categories and Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Rx Filter Tabs */}
          <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-medium">
            <button
              onClick={() => setRxFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
                rxFilter === 'all'
                  ? 'bg-white dark:bg-[#161c26] text-teal-600 dark:text-teal-400 font-bold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All Types
            </button>
            <button
              onClick={() => setRxFilter('rx')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
                rxFilter === 'rx'
                  ? 'bg-white dark:bg-[#161c26] text-amber-600 dark:text-amber-400 font-bold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Rx Only
            </button>
            <button
              onClick={() => setRxFilter('otc')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
                rxFilter === 'otc'
                  ? 'bg-white dark:bg-[#161c26] text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              OTC
            </button>
          </div>

          {/* Category Dropdown */}
          <div className="flex items-center gap-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition cursor-pointer"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            {(search || selectedCategory || rxFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearch('');
                  setSelectedCategory('');
                  setRxFilter('all');
                }}
                className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition font-medium cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white dark:bg-[#161c26] border border-slate-100/90 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8">
              <CardSkeleton height="h-64" />
            </div>
          ) : filteredMedicines.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 flex items-center justify-center mx-auto mb-3 border border-teal-100 dark:border-teal-900/50">
                <Pill className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {search || selectedCategory || rxFilter !== 'all'
                  ? 'No matching medications found'
                  : 'Your medication catalog is empty'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                {search || selectedCategory || rxFilter !== 'all'
                  ? 'Try clearing active filters or checking spelling'
                  : 'Start adding pharmaceutical items to dispense in POS and track stock batches'}
              </p>
              <button
                onClick={handleOpenCreate}
                className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-xl shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add First Medicine
              </button>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800 text-[11px]">
                <tr>
                  <th className="py-3.5 px-5">Medicine & Formula</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Dosage & Strength</th>
                  <th className="py-3.5 px-4">Retail Price</th>
                  <th className="py-3.5 px-4">Cost Price</th>
                  <th className="py-3.5 px-4">Classification</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80 dark:divide-slate-800/60 font-medium">
                {filteredMedicines.map((item) => {
                  const itemMargin = (Number(item.price) || 0) - (Number(item.costPrice) || 0);
                  const marginPct = (Number(item.price) || 0) > 0
                    ? ((itemMargin / item.price) * 100).toFixed(0)
                    : 0;

                  return (
                    <tr
                      key={item._id}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition group"
                    >
                      {/* Name & Generic */}
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0 border border-teal-100 dark:border-teal-900/50">
                            <Pill className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white block group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                              {item.name}
                            </span>
                            {item.genericName ? (
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                {item.genericName}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                                Generic formulation
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4">
                        <span className="inline-block px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800/80 dark:text-slate-300 border border-slate-200/50 dark:border-slate-700/50">
                          {item.category || 'General'}
                        </span>
                      </td>

                      {/* Dosage & Strength */}
                      <td className="py-3.5 px-4">
                        <span className="text-slate-800 dark:text-slate-200 font-medium block">
                          {item.dosageForm}
                        </span>
                        {item.strength && (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                            {item.strength}
                          </span>
                        )}
                      </td>

                      {/* Retail Price */}
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-900 dark:text-white font-mono text-sm block">
                          ${Number(item.price || 0).toFixed(2)}
                        </span>
                        {item.costPrice > 0 && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                            +{marginPct}% margin
                          </span>
                        )}
                      </td>

                      {/* Cost Price */}
                      <td className="py-3.5 px-4">
                        <span className="text-slate-500 dark:text-slate-400 font-mono text-xs">
                          ${Number(item.costPrice || 0).toFixed(2)}
                        </span>
                      </td>

                      {/* Classification Rx / OTC */}
                      <td className="py-3.5 px-4">
                        {item.requiresPrescription ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 shadow-2xs">
                            <ShieldAlert className="w-3 h-3 text-amber-500 shrink-0" />
                            <span>Rx Required</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 shadow-2xs">
                            <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0" />
                            <span>OTC</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleEdit(item)}
                            title="Edit product"
                            className="p-1.5 text-slate-600 hover:text-teal-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-teal-400 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(item._id, item.name)}
                            disabled={deletingId === item._id}
                            title="Delete product"
                            className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 dark:text-slate-400 dark:hover:text-rose-400 dark:hover:bg-rose-950/30 rounded-lg transition disabled:opacity-40 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer Summary */}
        {filteredMedicines.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-800/20">
            <span>
              Showing <strong>{filteredMedicines.length}</strong> of{' '}
              <strong>{medicines.length}</strong> registered formulations
            </span>
            <span className="font-mono text-[11px]">
              Catalog ID: PHARM-CAT-{medicines.length}
            </span>
          </div>
        )}
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
