import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingCart, FileText, AlertCircle, X, CheckCircle2, Clock, PauseCircle, PlayCircle, Keyboard, Info, Wifi, WifiOff,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getMyPharmacy } from '../../api/pharmacyApi';
import { lookupMedicine } from '../../api/medicineApi';
import { createSale, getPosCatalog, getTopItems } from '../../api/salesApi';
import { getCurrentShift } from '../../api/shiftApi';
import { getPaymentProviders } from '../../api/paymentApi';
import { saveCatalog, loadCatalog, decrementCachedStock } from '../../offline/catalogCache';
import { enqueueSale, newOfflineId, isNetworkError } from '../../offline/queue';
import { useOfflineSync } from '../../offline/useOfflineSync';
import { formatMoney, formatDateTime } from '../../utils/format';
import InvoiceReceiptModal from './InvoiceReceiptModal';
import ProductSearch from '../../components/pos/ProductSearch';
import QuickPick from '../../components/pos/QuickPick';
import CartLines from '../../components/pos/CartLines';
import CustomerSection from '../../components/pos/CustomerSection';
import ClinicalSection from '../../components/pos/ClinicalSection';
import PaymentPanel from '../../components/pos/PaymentPanel';
import OpenShiftModal from '../../components/pos/OpenShiftModal';
import HeldSalesModal, { HoldSaleModal } from '../../components/pos/HeldSalesModal';
import OfflinePanel from '../../components/pos/OfflinePanel';
import { useBarcodeScanner, usePosShortcuts } from '../../components/pos/usePosKeyboard';
import {
  cardCls, round2, unitsOf, findUnit, matchCode, baseQtyInCart, computeTotals, paymentStatus, newPaymentRow,
  loadHeld, saveHeld, cacheShift, loadCachedShift, errMsg,
} from '../../components/pos/posUtils';

const SEVERE = ['major', 'contraindicated'];
const emptyRx = { number: '', prescriber: '', notes: '' };
const emptyWalkIn = { name: '', phone: '' };
let lineSeq = 0;

const POS = () => {
  const { user, activePharmacyId, can } = useAuth();
  const userId = user?._id;
  const pharmacyId = activePharmacyId || 'default';

  // ---------- Catalog / settings ----------
  const [pharmacy, setPharmacy] = useState(null);
  const [medicines, setMedicines] = useState([]);
  const [catalogSavedAt, setCatalogSavedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [topIds, setTopIds] = useState([]);
  const [providers, setProviders] = useState({ default: 'manual', providers: [{ name: 'manual', label: 'Manual', flow: 'manual', configured: true }] });

  // ---------- Sale state ----------
  const [cart, setCart] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [walkIn, setWalkIn] = useState(emptyWalkIn);
  const [patient, setPatient] = useState(null);
  const [prescription, setPrescription] = useState(null);
  const [legacyRx, setLegacyRx] = useState(emptyRx);
  const [warnings, setWarnings] = useState({ interactions: [], allergyHits: [] });
  const [ackKey, setAckKey] = useState('');
  const [discount, setDiscount] = useState('');
  const [payments, setPayments] = useState(() => [newPaymentRow('cash')]);

  // ---------- UI state ----------
  const [shiftState, setShiftState] = useState({ loaded: false, shift: null, requireShift: false });
  const [shiftModal, setShiftModal] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [held, setHeld] = useState(() => loadHeld(pharmacyId, userId));
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [completedSale, setCompletedSale] = useState(null);
  const [showHelp, setShowHelp] = useState(false);

  const searchRef = useRef(null);
  const qtyInputs = useRef(new Map());
  const offlineIdRef = useRef(null); // reused when a checkout is retried (idempotent)
  const promptedShift = useRef(false);

  // ---------- Loading ----------
  const loadCatalogData = useCallback(async () => {
    const isOnline = navigator.onLine !== false;
    if (isOnline) {
      try {
        const [cat, ph] = await Promise.all([getPosCatalog(), getMyPharmacy()]);
        setMedicines(cat.medicines || []);
        setPharmacy(ph.pharmacy || null);
        setCatalogSavedAt(cat.generatedAt || new Date().toISOString());
        saveCatalog(pharmacyId, { medicines: cat.medicines || [], pharmacy: ph.pharmacy || null });
        return;
      } catch (err) {
        if (!isNetworkError(err)) setError(errMsg(err, 'Failed to load the catalog'));
      }
    }
    const cached = await loadCatalog(pharmacyId);
    if (cached) {
      setMedicines(cached.medicines || []);
      setPharmacy(cached.pharmacy || null);
      setCatalogSavedAt(cached.savedAt);
    } else if (!isOnline) {
      setError('You are offline and no catalog is cached on this device yet.');
    }
  }, [pharmacyId]);

  const loadShift = useCallback(async () => {
    try {
      const data = await getCurrentShift();
      const next = { loaded: true, shift: data.shift || null, requireShift: Boolean(data.requireShift) };
      setShiftState(next);
      cacheShift(pharmacyId, userId, next);
      if (!data.shift && !promptedShift.current) {
        promptedShift.current = true;
        setShiftModal(true);
      }
    } catch {
      const cached = loadCachedShift(pharmacyId, userId);
      setShiftState(cached ? { ...cached, loaded: true } : { loaded: true, shift: null, requireShift: false });
    }
  }, [pharmacyId, userId]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(loadShift, 0);
    (async () => {
      await loadCatalogData();
      if (!cancelled) setLoading(false);
    })();
    if (navigator.onLine !== false) {
      getTopItems({ days: 30, limit: 12 })
        .then((d) => !cancelled && setTopIds((d.items || []).map((i) => String(i.medicineId))))
        .catch(() => {});
      getPaymentProviders()
        .then((d) => !cancelled && d.providers && setProviders({ default: d.default, providers: d.providers }))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [loadCatalogData, loadShift]);

  const { online, pending, failed, syncing, syncNow } = useOfflineSync({
    pharmacyId,
    userId,
    onSynced: () => {
      setInfo('Offline sales synced.');
      loadCatalogData();
    },
  });

  // ---------- Derived ----------
  const medById = useMemo(() => new Map(medicines.map((m) => [String(m._id), m])), [medicines]);
  const quickPicks = useMemo(() => topIds.map((id) => medById.get(id)).filter(Boolean), [topIds, medById]);
  const availableOf = useCallback(
    (med) => Math.max(0, (Number(med.stock) || 0) - baseQtyInCart(cart, String(med._id))),
    [cart]
  );
  const maxQtyOf = useCallback(
    (line) => {
      const stock = Number(line.medicine.stock) || 0;
      return Math.max(1, Math.floor((stock - baseQtyInCart(cart, line.medicineId, line.key)) / line.unit.factor));
    },
    [cart]
  );

  const totals = useMemo(() => computeTotals(cart, discount, pharmacy), [cart, discount, pharmacy]);

  // A single payment row left empty means "pay the exact total with it"
  const effectivePayments = useMemo(
    () =>
      payments.map((p) => ({
        ...p,
        amount: payments.length === 1 && p.amount === '' ? totals.grandTotal : round2(Number(p.amount) || 0),
      })),
    [payments, totals.grandTotal]
  );
  const payStatus = useMemo(() => paymentStatus(effectivePayments, totals.grandTotal), [effectivePayments, totals.grandTotal]);

  const needsRx = cart.some((l) => l.medicine.requiresPrescription);
  const hasControlled = cart.some((l) => l.medicine.isControlled);
  const canCredit = can('credit:sell');
  const allowedMethods = useMemo(
    () => (online ? ['cash', 'card', 'mobile_money', ...(canCredit && customer ? ['credit'] : [])] : ['cash']),
    [online, canCredit, customer]
  );

  const warningKey = `${patient?._id || ''}|${[...new Set(cart.map((l) => l.medicineId))].sort().join(',')}`;
  const severeWarnings =
    warnings.allergyHits.length > 0 || warnings.interactions.some((i) => SEVERE.includes(i.severity));
  const warningsAcked = !severeWarnings || ackKey === warningKey;
  const requireShiftUi = pharmacy?.settings?.requireShift !== false || shiftState.requireShift;

  const blockers = useMemo(() => {
    const list = [];
    if (cart.length === 0) return list;
    if (shiftState.loaded && !shiftState.shift && requireShiftUi) list.push('Open a shift to start selling');
    if (hasControlled) {
      if (!online) list.push('Controlled medicines cannot be sold offline');
      else if (!can('controlled:dispense')) list.push('Only a pharmacist or owner can dispense controlled medicines');
      else if (!patient || !prescription) list.push('Controlled medicines need a patient and a prescription');
    }
    if (needsRx && !prescription && !(legacyRx.number.trim() && legacyRx.prescriber.trim())) {
      list.push('Enter the prescription number and prescriber (or select a prescription)');
    }
    if (!warningsAcked) list.push('Review and confirm the clinical warnings');
    if (!payStatus.covered) list.push(payStatus.invalidExcess ? 'Only cash can exceed the total' : 'Payments do not cover the total');
    effectivePayments.forEach((p) => {
      if (!allowedMethods.includes(p.method)) list.push(`${p.method.replace('_', ' ')} is not available now`);
      if (p.method === 'credit' && !customer) list.push('Select a customer for credit');
      if (p.method === 'mobile_money' && p.amount > 0) {
        if (p.intentId && p.intentStatus !== 'confirmed') list.push('Waiting for mobile money confirmation');
        if (!p.intentId && !p.reference.trim()) list.push('Enter the mobile money transaction reference');
      }
    });
    return [...new Set(list)];
  }, [
    cart.length, shiftState, requireShiftUi, hasControlled, online, can, patient, prescription, needsRx, legacyRx,
    warningsAcked, payStatus, effectivePayments, allowedMethods, customer,
  ]);

  // ---------- Cart actions ----------
  const addToCart = useCallback(
    (med, unitArg) => {
      setError('');
      const unit = unitArg || unitsOf(med)[0];
      const id = String(med._id);
      if (med.isControlled && !online) {
        setError(`"${med.name}" is a controlled medicine and cannot be sold offline`);
        return;
      }
      const available = (Number(med.stock) || 0) - baseQtyInCart(cart, id);
      if (available < unit.factor) {
        setError(`Not enough stock for "${med.name}" (${Math.max(0, available)} ${med.baseUnit || 'unit'} left)`);
        return;
      }
      const existing = cart.find((l) => l.medicineId === id && l.unit.name === unit.name);
      if (existing) {
        setSelectedKey(existing.key);
        setCart((prev) => prev.map((l) => (l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l)));
        return;
      }
      lineSeq += 1;
      const key = `${id}-${lineSeq}`;
      setSelectedKey(key);
      setCart((prev) => [
        ...prev,
        { key, medicineId: id, name: med.name, medicine: med, unit, quantity: 1, taxExempt: Boolean(med.taxExempt) },
      ]);
    },
    [online, cart]
  );

  const setQty = (key, value) => {
    const qty = parseInt(value, 10);
    if (Number.isNaN(qty) || qty <= 0) return;
    setCart((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const stock = Number(l.medicine.stock) || 0;
        const max = Math.max(1, Math.floor((stock - baseQtyInCart(prev, l.medicineId, l.key)) / l.unit.factor));
        return { ...l, quantity: Math.min(qty, max) };
      })
    );
  };

  const setUnit = (key, unitName) => {
    const line = cart.find((l) => l.key === key);
    if (!line) return;
    const unit = findUnit(line.medicine, unitName);
    const stock = Number(line.medicine.stock) || 0;
    const max = Math.floor((stock - baseQtyInCart(cart, line.medicineId, line.key)) / unit.factor);
    if (max < 1) {
      setError(`Not enough stock for 1 ${unit.name} of "${line.name}"`);
      return;
    }
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, unit, quantity: Math.min(l.quantity, max) } : l)));
  };

  const removeLine = (key) => setCart((prev) => prev.filter((l) => l.key !== key));

  const resetSale = useCallback(() => {
    setCart([]);
    setSelectedKey(null);
    setCustomer(null);
    setWalkIn(emptyWalkIn);
    setPatient(null);
    setPrescription(null);
    setLegacyRx(emptyRx);
    setWarnings({ interactions: [], allergyHits: [] });
    setAckKey('');
    setDiscount('');
    setPayments([newPaymentRow('cash')]);
    offlineIdRef.current = null;
  }, []);

  // Code from the scanner or typed into the search box: local catalog first, then the API
  const handleCode = useCallback(
    async (code) => {
      const local = matchCode(medicines, code);
      if (local) {
        addToCart(local.medicine, local.unit);
        return true;
      }
      if (navigator.onLine === false) {
        setError(`No medicine with code ${code} in the offline catalog`);
        return false;
      }
      try {
        const { medicine, unit } = await lookupMedicine(code);
        const known = medById.get(String(medicine._id));
        const med = known || { ...medicine, stock: 0 };
        addToCart(med, findUnit(med, unit?.name));
        return true;
      } catch (err) {
        if (err.response?.status === 404) setError(`No medicine found for code ${code}`);
        else setError(errMsg(err, 'Barcode lookup failed'));
        return false;
      }
    },
    [medicines, medById, addToCart]
  );

  useBarcodeScanner(handleCode);

  // ---------- Held sales ----------
  const snapshot = (label) => ({
    id: newOfflineId(),
    label,
    createdAt: new Date().toISOString(),
    cart,
    customer,
    walkIn,
    patient,
    prescription,
    legacyRx,
    discount,
    total: totals.grandTotal,
  });

  const holdCurrent = (label) => {
    if (cart.length === 0) return;
    const next = [snapshot(label), ...held];
    setHeld(next);
    saveHeld(pharmacyId, userId, next);
    resetSale();
    setHoldOpen(false);
    setInfo(`Sale held as “${label}”.`);
  };

  const resumeHeld = (entry) => {
    let next = held.filter((h) => h.id !== entry.id);
    if (cart.length > 0) next = [snapshot(`Auto-held ${new Date().toLocaleTimeString()}`), ...next];
    setHeld(next);
    saveHeld(pharmacyId, userId, next);
    resetSale();
    // Refresh stock info from the current catalog
    setCart(entry.cart.map((l) => ({ ...l, medicine: medById.get(l.medicineId) || l.medicine })));
    setCustomer(entry.customer || null);
    setWalkIn(entry.walkIn || emptyWalkIn);
    setPatient(entry.patient || null);
    setPrescription(entry.prescription || null);
    setLegacyRx(entry.legacyRx || emptyRx);
    setDiscount(entry.discount || '');
    setHeldOpen(false);
  };

  const deleteHeld = (id) => {
    const next = held.filter((h) => h.id !== id);
    setHeld(next);
    saveHeld(pharmacyId, userId, next);
  };

  // ---------- Checkout ----------
  const buildPayload = (offlineId) => ({
    items: cart.map((l) => ({ medicineId: l.medicineId, quantity: l.quantity, unitName: l.unit.name })),
    customerId: customer?._id || undefined,
    customer: customer ? undefined : { name: walkIn.name.trim() || undefined, phone: walkIn.phone.trim() || undefined },
    patientId: patient?._id || undefined,
    prescriptionId: prescription?._id || undefined,
    ...(needsRx && !prescription
      ? { prescription: { number: legacyRx.number.trim(), prescriber: legacyRx.prescriber.trim(), notes: legacyRx.notes.trim() } }
      : {}),
    discount: totals.discount,
    payments: effectivePayments
      .filter((p) => p.amount > 0)
      .map((p) => ({
        method: p.method,
        amount: p.amount,
        reference: p.reference?.trim() || undefined,
        provider: p.method === 'mobile_money' ? p.provider || 'manual' : undefined,
        intentId: p.intentId || undefined,
      })),
    offlineId,
  });

  const offlineEligible = () =>
    !hasControlled && effectivePayments.every((p) => p.method === 'cash' || p.amount <= 0);

  // Provisional receipt for a sale saved offline
  const provisionalSale = (offlineId, payload) => ({
    _id: offlineId,
    invoiceNumber: `OFFLINE-${offlineId.slice(0, 8).toUpperCase()}`,
    createdAt: new Date().toISOString(),
    customer: { name: walkIn.name.trim() || 'Walk-in Customer', phone: walkIn.phone.trim() },
    items: cart.map((l) => ({
      _id: l.key,
      name: l.name,
      quantity: l.quantity * l.unit.factor,
      unitName: l.unit.name,
      unitFactor: l.unit.factor,
      unitPrice: round2(l.unit.price / l.unit.factor),
      subtotal: round2(l.unit.price * l.quantity),
      batchNo: '-',
    })),
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    taxLines: totals.tax > 0 ? [{ name: totals.taxName, rate: totals.taxRate, amount: totals.tax }] : [],
    grandTotal: totals.grandTotal,
    payments: [{ method: 'cash', amount: totals.grandTotal }],
    amountPaid: totals.grandTotal,
    change: payStatus.change,
    balanceDue: 0,
    notes: 'Saved offline – pending sync',
    offlinePending: payload.offlineId,
  });

  const saveOffline = async (offlineId, payload) => {
    await enqueueSale({
      offlineId,
      pharmacyId,
      userId,
      payload,
      summary: {
        grandTotal: totals.grandTotal,
        lines: cart.map((l) => ({ name: l.name, quantity: l.quantity, unitName: l.unit.name })),
      },
    });
    const lines = cart.map((l) => ({ medicineId: l.medicineId, baseQuantity: l.quantity * l.unit.factor }));
    decrementCachedStock(pharmacyId, lines);
    setMedicines((prev) =>
      prev.map((m) => {
        const used = lines.filter((x) => x.medicineId === String(m._id)).reduce((s, x) => s + x.baseQuantity, 0);
        return used ? { ...m, stock: Math.max(0, (Number(m.stock) || 0) - used) } : m;
      })
    );
    setCompletedSale(provisionalSale(offlineId, payload));
    resetSale();
    setInfo('Sale saved offline. It will be synced automatically.');
  };

  const handleCheckout = async () => {
    if (cart.length === 0 || checkoutLoading) return;
    if (shiftState.loaded && !shiftState.shift && requireShiftUi) {
      setShiftModal(true);
      return;
    }
    if (blockers.length > 0) {
      setError(blockers[0]);
      return;
    }
    setError('');
    setInfo('');
    if (!offlineIdRef.current) offlineIdRef.current = newOfflineId();
    const offlineId = offlineIdRef.current;
    const payload = buildPayload(offlineId);

    if (!online) {
      if (!offlineEligible()) {
        setError('Offline sales must be paid in cash and cannot include controlled medicines');
        return;
      }
      await saveOffline(offlineId, payload);
      return;
    }

    setCheckoutLoading(true);
    try {
      const res = await createSale(payload);
      setCompletedSale(res.sale);
      resetSale();
      loadCatalogData();
      if (shiftState.shift) loadShift();
    } catch (err) {
      if (isNetworkError(err)) {
        if (offlineEligible()) {
          await saveOffline(offlineId, payload);
        } else {
          setError('Connection lost. The sale may not have been recorded – check Sales History, then press Complete again (it will not be charged twice).');
        }
      } else if (err.response?.data?.code === 'SHIFT_REQUIRED') {
        setShiftModal(true);
        setError(err.response.data.message);
      } else {
        setError(errMsg(err, 'Checkout failed'));
      }
    } finally {
      setCheckoutLoading(false);
    }
  };

  const clearWithConfirm = () => {
    if (cart.length > 0 && window.confirm('Clear the current sale?')) resetSale();
  };

  usePosShortcuts({
    onSearch: () => searchRef.current?.focus(),
    onQuantity: () => {
      const key = selectedKey && cart.some((l) => l.key === selectedKey) ? selectedKey : cart[cart.length - 1]?.key;
      if (key) qtyInputs.current.get(key)?.focus();
    },
    onCheckout: handleCheckout,
    onEscape: clearWithConfirm,
  });

  const registerQtyInput = useCallback((key, el) => {
    if (el) qtyInputs.current.set(key, el);
    else qtyInputs.current.delete(key);
  }, []);

  const shift = shiftState.shift;

  return (
    <div className="space-y-4 animate-fade-in max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 uppercase tracking-wider">
            Dispensary Terminal
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">Point of Sale</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {shift ? (
            <Link
              to="/pharmacy/shifts"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60"
              title="Shift details"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {shift.shiftNumber} · since {formatDateTime(shift.openedAt)}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setShiftModal(true)}
              disabled={!online}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 cursor-pointer disabled:opacity-60"
            >
              <Clock className="w-3.5 h-3.5" /> No open shift – open
            </button>
          )}
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border ${
              online
                ? 'text-slate-500 border-slate-200 dark:border-slate-700'
                : 'text-amber-700 bg-amber-50 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
            }`}
          >
            {online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {online ? 'Online' : 'Offline'}
            {pending.length > 0 && <span className="ml-1 px-1.5 rounded-full bg-sky-600 text-white">{pending.length}</span>}
          </span>
          <button
            type="button"
            onClick={() => setHeldOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
          >
            <PlayCircle className="w-3.5 h-3.5" /> Held ({held.length})
          </button>
          <Link
            to="/pharmacy/sales"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl"
          >
            <FileText className="w-3.5 h-3.5" /> Sales History
          </Link>
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 cursor-pointer"
            title="Keyboard shortcuts"
          >
            <Keyboard className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showHelp && (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 flex flex-wrap gap-x-5 gap-y-1">
          <span><kbd className="font-mono font-bold">F2</kbd> search</span>
          <span><kbd className="font-mono font-bold">↑ ↓ Enter</kbd> pick result</span>
          <span><kbd className="font-mono font-bold">F4</kbd> quantity of selected line</span>
          <span><kbd className="font-mono font-bold">F9</kbd> complete sale</span>
          <span><kbd className="font-mono font-bold">Esc</kbd> clear sale</span>
          <span>Scan a barcode anywhere to add the item</span>
        </div>
      )}

      <OfflinePanel online={online} pending={pending} failed={failed} syncing={syncing} onSync={syncNow} catalogSavedAt={catalogSavedAt} />

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 text-xs flex justify-between items-center">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError('')} className="p-1 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      )}
      {info && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 shrink-0" />
            <span>{info}</span>
          </div>
          <button type="button" onClick={() => setInfo('')} className="p-1 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: search + quick pick */}
        <div className="lg:col-span-7 space-y-3">
          <ProductSearch
            medicines={medicines}
            loading={loading}
            availableOf={availableOf}
            onAdd={addToCart}
            onCode={handleCode}
            inputRef={searchRef}
          />
          <QuickPick items={quickPicks} availableOf={availableOf} onAdd={addToCart} />
        </div>

        {/* Right: cart + checkout */}
        <div className={`lg:col-span-5 ${cardCls} p-4 space-y-3`}>
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Current sale</h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                {cart.length} line(s)
              </span>
            </div>
            <div className="flex items-center gap-3">
              {cart.length > 0 && (
                <button type="button" onClick={() => setHoldOpen(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-emerald-600 cursor-pointer">
                  <PauseCircle className="w-3.5 h-3.5" /> Hold
                </button>
              )}
              {cart.length > 0 && (
                <button type="button" onClick={clearWithConfirm} className="text-xs text-rose-500 hover:text-rose-700 font-semibold cursor-pointer">
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[280px] overflow-y-auto pr-1 custom-scrollbar">
            <CartLines
              cart={cart}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
              onQty={setQty}
              onUnit={setUnit}
              onRemove={removeLine}
              maxQtyOf={maxQtyOf}
              registerQtyInput={registerQtyInput}
            />
          </div>

          {cart.length > 0 && (
            <>
              <CustomerSection
                customer={customer}
                onChange={(c) => {
                  setCustomer(c);
                  if (!c) setPayments((rows) => rows.map((r) => (r.method === 'credit' ? { ...r, method: 'cash' } : r)));
                }}
                walkIn={walkIn}
                onWalkIn={setWalkIn}
                online={online}
              />

              <ClinicalSection
                cart={cart}
                online={online}
                patient={patient}
                onPatient={setPatient}
                prescription={prescription}
                onPrescription={setPrescription}
                legacyRx={legacyRx}
                onLegacyRx={setLegacyRx}
                onWarnings={setWarnings}
                needsRx={needsRx}
                hasControlled={hasControlled}
              />

              {severeWarnings && (
                <label className="flex items-start gap-2 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-[11px] text-rose-700 dark:text-rose-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ackKey === warningKey}
                    onChange={(e) => setAckKey(e.target.checked ? warningKey : '')}
                    className="mt-0.5"
                  />
                  <span>
                    I have reviewed the {warnings.allergyHits.length > 0 ? 'allergy' : ''}
                    {warnings.allergyHits.length > 0 && warnings.interactions.length > 0 ? ' and ' : ''}
                    {warnings.interactions.some((i) => SEVERE.includes(i.severity)) ? 'major interaction' : ''} warnings and
                    confirm this sale is clinically appropriate.
                  </span>
                </label>
              )}

              {canCredit && !customer && online && (
                <p className="text-[11px] text-slate-400">Select a customer account to sell on credit.</p>
              )}

              <PaymentPanel
                totals={totals}
                discount={discount}
                onDiscount={setDiscount}
                payments={payments}
                onPayments={setPayments}
                status={payStatus}
                allowedMethods={allowedMethods}
                providers={providers.providers}
                defaultProvider={providers.default}
              />
            </>
          )}

          {blockers.length > 0 && (
            <ul className="text-[11px] text-amber-700 dark:text-amber-400 space-y-0.5">
              {blockers.map((b) => (
                <li key={b}>• {b}</li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={handleCheckout}
            disabled={checkoutLoading || cart.length === 0}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2"
          >
            {checkoutLoading ? (
              'Processing sale…'
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {online ? 'Complete sale' : 'Save offline sale'} ({formatMoney(totals.grandTotal)}) · F9
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      <OpenShiftModal
        open={shiftModal}
        required={requireShiftUi}
        onClose={() => setShiftModal(false)}
        onOpened={(s) => {
          const next = { loaded: true, shift: s, requireShift: shiftState.requireShift };
          setShiftState(next);
          cacheShift(pharmacyId, userId, next);
          setShiftModal(false);
          setInfo(`Shift ${s.shiftNumber} opened.`);
        }}
      />
      <HoldSaleModal
        open={holdOpen}
        onClose={() => setHoldOpen(false)}
        onHold={holdCurrent}
        suggestion={walkIn.name || customer?.name || `Sale ${new Date().toLocaleTimeString()}`}
      />
      <HeldSalesModal open={heldOpen} onClose={() => setHeldOpen(false)} held={held} onResume={resumeHeld} onDelete={deleteHeld} />

      <InvoiceReceiptModal
        isOpen={Boolean(completedSale)}
        onClose={() => {
          setCompletedSale(null);
          setTimeout(() => searchRef.current?.focus(), 0);
        }}
        sale={completedSale}
        pharmacy={pharmacy || undefined}
      />
    </div>
  );
};

export default POS;
