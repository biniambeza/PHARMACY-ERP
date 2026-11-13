import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Barcode, Percent } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getMedicines, getCategories, deleteMedicine } from '../../api/medicineApi';
import useAsync from '../../hooks/useAsync';
import MedicineModal from './MedicineModal';
import Can from '../../components/common/Can';
import BarcodeLabelsModal from '../../components/catalog/BarcodeLabelsModal';
import BulkPriceModal from '../../components/catalog/BulkPriceModal';
import PriceHistoryModal from '../../components/catalog/PriceHistoryModal';
import MedicineKpiCards from '../../components/inventory/MedicineKpiCards';
import MedicineFilters from '../../components/inventory/MedicineFilters';
import MedicineTable from '../../components/inventory/MedicineTable';

const Medicines = () => {
  const { t } = useTranslation('medicines');
  const [medicines, setMedicines] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [rxFilter, setRxFilter] = useState('all'); // 'all' | 'rx' | 'otc'
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMedicine, setSelectedMedicine] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState(null);
  const [marginOnly, setMarginOnly] = useState(false);

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

  const fetchCategories = useCallback(async () => {
    try {
      const data = await getCategories();
      return data.categories || [];
    } catch (err) {
      console.error('Failed to load categories:', err);
      throw err;
    }
  }, []);
  const { data: categories, reload: loadCategories } = useAsync(fetchCategories, []);

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
    if (!window.confirm(t('page.confirmDelete', { name }))) {
      return;
    }

    setDeletingId(id);
    try {
      const res = await deleteMedicine(id);
      if (res?.archived) alert(res.message);
      await loadMedicines();
      await loadCategories();
    } catch (err) {
      alert(err.response?.data?.message || t('page.deleteFailed'));
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
      if (rxFilter === 'rx' && !m.requiresPrescription) return false;
      if (rxFilter === 'otc' && m.requiresPrescription) return false;
      if (marginOnly && !m.marginWarning) return false;
      return true;
    });
  }, [medicines, rxFilter, marginOnly]);

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const allVisibleSelected = filteredMedicines.length > 0 && filteredMedicines.every((m) => selectedIds.has(m._id));
  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filteredMedicines.forEach((m) => next.delete(m._id));
      else filteredMedicines.forEach((m) => next.add(m._id));
      return next;
    });
  };
  const selectedMedicines = medicines.filter((m) => selectedIds.has(m._id));
  const marginWarningCount = medicines.filter((m) => m.marginWarning).length;

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

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setLabelsOpen(true)}
            disabled={selectedIds.size === 0}
            title={selectedIds.size ? t('page.labelsTitleSelected') : t('page.labelsTitleNone')}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 text-xs font-semibold rounded-xl transition cursor-pointer"
          >
            <Barcode className="w-4 h-4" />
            <span>{selectedIds.size ? t('page.labelsCount', { n: selectedIds.size }) : t('page.labels')}</span>
          </button>
          <Can perm="price:manage">
            <button
              onClick={() => setBulkOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              <Percent className="w-4 h-4" />
              <span>{t('page.bulkPrice')}</span>
            </button>
          </Can>
          <Can perm="medicine:manage">
            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{t('page.addMedicine')}</span>
            </button>
          </Can>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <MedicineKpiCards medicines={medicines} categoryCount={categories.length} />

      {/* Filter and Controls Toolbar */}
      <MedicineFilters
        search={search}
        setSearch={setSearch}
        rxFilter={rxFilter}
        setRxFilter={setRxFilter}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        categories={categories}
        marginWarningCount={marginWarningCount}
        marginOnly={marginOnly}
        setMarginOnly={setMarginOnly}
      />

      {/* Main Table Container */}
      <MedicineTable
        loading={loading}
        medicines={medicines}
        filteredMedicines={filteredMedicines}
        hasFilters={!!(search || selectedCategory || rxFilter !== 'all')}
        selectedIds={selectedIds}
        allVisibleSelected={allVisibleSelected}
        onToggleAll={toggleAllVisible}
        onToggle={toggleSelected}
        onCreate={handleOpenCreate}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onHistory={setHistoryFor}
        deletingId={deletingId}
      />

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

      {labelsOpen && (
        <BarcodeLabelsModal
          medicines={selectedMedicines}
          onClose={() => setLabelsOpen(false)}
          onChanged={loadMedicines}
        />
      )}
      {bulkOpen && (
        <BulkPriceModal
          categories={categories}
          selectedIds={[...selectedIds]}
          onClose={() => setBulkOpen(false)}
          onSuccess={loadMedicines}
        />
      )}
      {historyFor && <PriceHistoryModal medicine={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  );
};

export default Medicines;
