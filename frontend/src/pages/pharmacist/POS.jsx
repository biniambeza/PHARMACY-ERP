import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { lookupMedicine } from '../../api/medicineApi';
import { createSale } from '../../api/salesApi';
import { decrementCachedStock } from '../../offline/catalogCache';
import { enqueueSale, newOfflineId, isNetworkError } from '../../offline/queue';
import { useOfflineSync } from '../../offline/useOfflineSync';
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
import PosHeader from '../../components/pos/PosHeader';
import CartHeader from '../../components/pos/CartHeader';
import PosNotice from '../../components/pos/PosNotice';
import CheckoutFooter, { ClinicalAck } from '../../components/pos/CheckoutFooter';
import { usePosData } from '../../components/pos/usePosData';
import { useHeldSales } from '../../components/pos/useHeldSales';
import { usePosDerived } from '../../components/pos/usePosDerived';
import { useBarcodeScanner, usePosShortcuts } from '../../components/pos/usePosKeyboard';
import {
  cardCls, unitsOf, findUnit, matchCode, baseQtyInCart, newPaymentRow, cacheShift, errMsg,
} from '../../components/pos/posUtils';
import { SEVERE, computeBlockers, buildSalePayload, buildProvisionalSale } from '../../components/pos/posCheckout';

const emptyRx = { number: '', prescriber: '', notes: '' };
const emptyWalkIn = { name: '', phone: '' };
let lineSeq = 0;

const POS = () => {
  const { t } = useTranslation('pos');
  const { user, activePharmacyId, can } = useAuth();
  const userId = user?._id;
  const pharmacyId = activePharmacyId || 'default';

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
  const [shiftModal, setShiftModal] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [completedSale, setCompletedSale] = useState(null);

  const searchRef = useRef(null);
  const qtyInputs = useRef(new Map());
  const offlineIdRef = useRef(null); // reused when a checkout is retried (idempotent)

  // ---------- Catalog / settings / shift ----------
  const {
    pharmacy, medicines, setMedicines, catalogSavedAt, loading, topIds, providers,
    shiftState, setShiftState, loadCatalogData, loadShift,
  } = usePosData({ pharmacyId, userId, setError, setShiftModal });

  const { online, pending, failed, syncing, syncNow } = useOfflineSync({
    pharmacyId,
    userId,
    onSynced: () => {
      setInfo(t('info.synced'));
      loadCatalogData();
    },
  });

  // ---------- Derived ----------
  const { medById, quickPicks, availableOf, maxQtyOf, totals, effectivePayments, payStatus } = usePosDerived({
    medicines, topIds, cart, discount, pharmacy, payments,
  });

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

  const blockers = useMemo(
    () =>
      computeBlockers({
        t, cart, shiftState, requireShiftUi, hasControlled, online, can, patient, prescription, needsRx, legacyRx,
        warningsAcked, payStatus, effectivePayments, allowedMethods, customer,
      }),
    [
      t, cart, shiftState, requireShiftUi, hasControlled, online, can, patient, prescription, needsRx, legacyRx,
      warningsAcked, payStatus, effectivePayments, allowedMethods, customer,
    ]
  );

  // ---------- Cart actions ----------
  const addToCart = useCallback(
    (med, unitArg) => {
      setError('');
      const unit = unitArg || unitsOf(med)[0];
      const id = String(med._id);
      if (med.isControlled && !online) {
        setError(t('errors.controlledOffline', { name: med.name }));
        return;
      }
      const available = (Number(med.stock) || 0) - baseQtyInCart(cart, id);
      if (available < unit.factor) {
        setError(t('errors.notEnoughStock', { name: med.name, available: Math.max(0, available), unit: med.baseUnit || t('unit') }));
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
    [online, cart, t]
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
      setError(t('errors.notEnoughForUnit', { unit: unit.name, name: line.name }));
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
        setError(t('errors.codeNotOffline', { code }));
        return false;
      }
      try {
        const { medicine, unit } = await lookupMedicine(code);
        const known = medById.get(String(medicine._id));
        const med = known || { ...medicine, stock: 0 };
        addToCart(med, findUnit(med, unit?.name));
        return true;
      } catch (err) {
        if (err.response?.status === 404) setError(t('errors.codeNotFound', { code }));
        else setError(errMsg(err, t('errors.lookupFailed')));
        return false;
      }
    },
    [medicines, medById, addToCart, t]
  );

  useBarcodeScanner(handleCode);

  // ---------- Held sales ----------
  const { held, hold, take, remove: deleteHeld } = useHeldSales({ pharmacyId, userId });
  const snapshot = (label) => ({
    label,
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
    hold(snapshot(label));
    resetSale();
    setHoldOpen(false);
    setInfo(t('info.held', { label }));
  };

  const resumeHeld = (entry) => {
    take(entry.id, cart.length > 0 ? snapshot(t('held.autoLabel', { time: new Date().toLocaleTimeString() })) : null);
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

  // ---------- Checkout ----------
  const buildPayload = (offlineId) =>
    buildSalePayload({ cart, customer, walkIn, patient, prescription, needsRx, legacyRx, totals, effectivePayments, offlineId });

  const offlineEligible = () =>
    !hasControlled && effectivePayments.every((p) => p.method === 'cash' || p.amount <= 0);

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
    setCompletedSale(buildProvisionalSale({ t, offlineId, payload, cart, walkIn, totals, payStatus }));
    resetSale();
    setInfo(t('info.savedOffline'));
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
        setError(t('errors.offlineRules'));
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
          setError(t('errors.connectionLost'));
        }
      } else if (err.response?.data?.code === 'SHIFT_REQUIRED') {
        setShiftModal(true);
        setError(err.response.data.message);
      } else {
        setError(errMsg(err, t('errors.checkoutFailed')));
      }
    } finally {
      setCheckoutLoading(false);
    }
  };

  const clearWithConfirm = () => {
    if (cart.length > 0 && window.confirm(t('cart.confirmClear'))) resetSale();
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

  return (
    <div className="space-y-4 animate-fade-in max-w-7xl mx-auto">
      <PosHeader
        shift={shiftState.shift}
        online={online}
        pendingCount={pending.length}
        heldCount={held.length}
        onOpenShift={() => setShiftModal(true)}
        onOpenHeld={() => setHeldOpen(true)}
      />

      <OfflinePanel online={online} pending={pending} failed={failed} syncing={syncing} onSync={syncNow} catalogSavedAt={catalogSavedAt} />

      <PosNotice tone="error" message={error} onClose={() => setError('')} />
      <PosNotice tone="info" message={info} onClose={() => setInfo('')} />

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
          <CartHeader count={cart.length} onHold={() => setHoldOpen(true)} onClear={clearWithConfirm} />

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
                <ClinicalAck
                  warnings={warnings}
                  checked={ackKey === warningKey}
                  onChange={(checked) => setAckKey(checked ? warningKey : '')}
                />
              )}

              {canCredit && !customer && online && (
                <p className="text-[11px] text-slate-400">{t('creditHint')}</p>
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

          <CheckoutFooter
            blockers={blockers}
            online={online}
            loading={checkoutLoading}
            disabled={checkoutLoading || cart.length === 0}
            total={totals.grandTotal}
            onCheckout={handleCheckout}
          />
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
          setInfo(t('info.shiftOpened', { number: s.shiftNumber }));
        }}
      />
      <HoldSaleModal
        open={holdOpen}
        onClose={() => setHoldOpen(false)}
        onHold={holdCurrent}
        suggestion={walkIn.name || customer?.name || t('held.suggestion', { time: new Date().toLocaleTimeString() })}
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
