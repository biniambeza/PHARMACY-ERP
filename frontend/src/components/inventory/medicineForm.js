// Form constants and helpers for MedicineModal.

export const DEFAULT_CATEGORIES = [
  'Antibiotics',
  'Analgesics',
  'Antipyretics',
  'Cardiovascular',
  'Respiratory',
  'Gastrointestinal',
  'Dermatology',
  'Vitamins & Supplements',
  'Antidiabetics',
  'Antihistamines',
  'Neurology',
  'Ophthalmology',
];

// Must match the backend enum (models/Medicine.js DOSAGE_FORMS)
export const DOSAGE_FORMS = [
  'Tablet',
  'Capsule',
  'Syrup',
  'Suspension',
  'Injection',
  'Ointment',
  'Cream',
  'Gel',
  'Inhaler',
  'Drops',
  'Other',
];

export const inputCls =
  'w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition disabled:opacity-60';
export const labelCls = 'block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1';
export const sectionCls = 'pt-4 border-t border-slate-100 dark:border-slate-800/80';
export const sectionTitle = 'text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3';

export const emptyForm = () => ({
  name: '',
  genericName: '',
  category: DEFAULT_CATEGORIES[0],
  dosageForm: 'Tablet',
  strength: '',
  price: '',
  costPrice: '',
  minStockLevel: 10,
  requiresPrescription: false,
  barcode: '',
  sku: '',
  baseUnit: 'unit',
  minMarginPercent: '',
  taxExempt: false,
  isControlled: false,
  controlledSchedule: '',
  leadTimeDays: 7,
  reorderSafetyDays: 7,
  priceChangeReason: '',
});

export const formFromMedicine = (m) => ({
  name: m.name || '',
  genericName: m.genericName || '',
  category: m.category || '',
  dosageForm: m.dosageForm || 'Tablet',
  strength: m.strength || '',
  price: m.price ?? '',
  costPrice: m.costPrice ?? '',
  minStockLevel: m.minStockLevel ?? 10,
  requiresPrescription: !!m.requiresPrescription,
  barcode: m.barcode || '',
  sku: m.sku || '',
  baseUnit: m.baseUnit || 'unit',
  minMarginPercent: m.minMarginPercent ?? '',
  taxExempt: !!m.taxExempt,
  isControlled: !!m.isControlled,
  controlledSchedule: m.controlledSchedule || '',
  leadTimeDays: m.leadTimeDays ?? 7,
  reorderSafetyDays: m.reorderSafetyDays ?? 7,
  priceChangeReason: '',
});

export const packsFromMedicine = (m) =>
  (m?.packUnits || []).map((p) => ({
    _id: p._id,
    name: p.name,
    factor: p.factor,
    price: p.price ?? '',
    barcode: p.barcode || '',
  }));
