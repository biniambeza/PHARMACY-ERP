import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/useAuth';
import { lookupMedicine } from '../../api/medicineApi';
import { useOfflineSyncContext } from '../../offline/offlineSyncContext';
import { clinicalCheckKey } from '../../components/clinical/ui';
import InvoiceReceiptModal from './InvoiceReceiptModal';
import ProductSearch from '../../components/pos/ProductSearch';
import QuickPick from '../../components/pos/QuickPick';
import OpenShiftModal from '../../components/pos/OpenShiftModal';
import HeldSalesModal, { HoldSaleModal } from '../../components/pos/HeldSalesModal';
import OfflinePanel from '../../components/pos/OfflinePanel';
import PosHeader from '../../components/pos/PosHeader';
import PosNotice from '../../components/pos/PosNotice';
import PosCartPanel from '../../components/pos/PosCartPanel';
import { usePosData } from '../../components/pos/usePosData';
import { useHeldSales } from '../../components/pos/useHeldSales';
import { usePosDerived } from '../../components/pos/usePosDerived';
import { usePosSale } from '../../components/pos/usePosSale';
import { usePosCheckout } from '../../components/pos/usePosCheckout';
import { useBarcodeScanner, usePosShortcuts } from '../../components/pos/usePosKeyboard';
import { findUnit, matchCode, cacheShift, errMsg } from '../../components/pos/posUtils';
import { SEVERE, computeBlockers } from '../../components/pos/posCheckout';

const POS = () => {
  const { t } = useTranslation('pos');
  const { user, activePharmacyId, can } = useAuth();
  const userId = user?._id;
  const pharmacyId = activePharmacyId || 'default';

  // ---------- UI state ----------
  const [shiftModal, setShiftModal] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [completedSale, setCompletedSale] = useState(null);

  const searchRef = useRef(null);
  const qtyInputs = useRef(new Map());

  // ---------- Catalog / settings / shift ----------
  const {
    pharmacy, medicines, setMedicines, catalogSavedAt, loading, topIds, providers,
    shiftState, setShiftState, loadCatalogData, loadShift,
  } = usePosData({ pharmacyId, userId, setError, setShiftModal });

  // Offline queue + sync run in the pharmacy layout (OfflineSyncProvider) for every page
  const { online, pending, failed, othersPending, othersFailed, syncing, syncNow, subscribeSynced } = useOfflineSyncContext();
  const loadCatalogRef = useRef(loadCatalogData);
  useEffect(() => {
    loadCatalogRef.current = loadCatalogData;
  }, [loadCatalogData]);
  useEffect(
    () =>
      subscribeSynced(() => {
        setInfo(t('info.synced'));
        loadCatalogRef.current();
      }),
    [subscribeSynced, t]
  );

  // ---------- Sale state ----------
  const sale = usePosSale({ t, online, setError });
  const {
    cart, selectedKey, customer, walkIn, patient, prescription, legacyRx, warnings, ackKey, payments, addToCart, resetSale,
    hasPendingIntent,
  } = sale;

  // ---------- Derived ----------
  const { medById, quickPicks, availableOf, maxQtyOf, totals, effectivePayments, payStatus, insuranceLines } = usePosDerived({
    medicines, topIds, cart, discount: sale.discount, pharmacy, payments,
  });

  const needsRx = cart.some((l) => l.medicine.requiresPrescription);
  const hasControlled = cart.some((l) => l.medicine.isControlled);
  const canCredit = can('credit:sell');
  const canInsurance = can('insurance:view');
  // Insurance is online only (the server rejects it in offline sync too)
  const allowedMethods = useMemo(
    () =>
      online
        ? ['cash', 'card', 'mobile_money', ...(canCredit && customer ? ['credit'] : []), ...(canInsurance ? ['insurance'] : [])]
        : ['cash'],
    [online, canCredit, customer, canInsurance]
  );

  // Allergy / interaction check: only a finished ('ok') result for exactly this patient + cart
  // counts. While it runs, after it failed (unless a manual check is confirmed) or with
  // unacknowledged severe warnings the sale is blocked. Offline the check cannot run.
  const warningKey = clinicalCheckKey(patient?._id, cart.map((l) => l.medicineId));
  // Same rule as ClinicalWarnings: one medicine without a patient has nothing to check
  const cartMedicineCount = new Set(cart.map((l) => l.medicineId)).size;
  const clinicalActive = online && (cartMedicineCount > 1 || (cartMedicineCount > 0 && Boolean(patient?._id)));
  const clinicalStatus = !clinicalActive ? 'ok' : warnings.key === warningKey ? warnings.status : 'checking';
  const severeWarnings =
    clinicalActive &&
    clinicalStatus === 'ok' &&
    (warnings.allergyHits.length > 0 || warnings.interactions.some((i) => SEVERE.includes(i.severity)));
  const warningsAcked = !severeWarnings || ackKey === warningKey;
  const clinicalOverride = clinicalStatus === 'failed' && ackKey === `override:${warningKey}`;
  const clinicalAck = (severeWarnings && warningsAcked) || clinicalOverride;
  // Same rule as the server: opt-in per pharmacy (missing = not required).
  const requireShiftUi = pharmacy?.settings?.requireShift === true || shiftState.requireShift;

  const blockers = useMemo(
    () =>
      computeBlockers({
        t, cart, shiftState, requireShiftUi, hasControlled, online, can, patient, prescription, needsRx, legacyRx,
        clinicalStatus: clinicalOverride ? 'ok' : clinicalStatus, warningsAcked, payStatus, effectivePayments,
        allowedMethods, customer,
      }),
    [
      t, cart, shiftState, requireShiftUi, hasControlled, online, can, patient, prescription, needsRx, legacyRx,
      clinicalStatus, clinicalOverride, warningsAcked, payStatus, effectivePayments, allowedMethods, customer,
    ]
  );

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

  // A mobile money push request still waiting is cancelled when the sale is put aside
  const confirmCancelPending = () => !hasPendingIntent || window.confirm(t('payment.confirmCancelPending'));

  const holdCurrent = (label) => {
    if (cart.length === 0) return;
    hold(sale.snapshot(label, totals.grandTotal));
    resetSale();
    setHoldOpen(false);
    setInfo(t('info.held', { label }));
  };

  const resumeHeld = (entry) => {
    if (!confirmCancelPending()) return;
    take(entry.id, cart.length > 0 ? sale.snapshot(t('held.autoLabel', { time: new Date().toLocaleTimeString() }), totals.grandTotal) : null);
    resetSale();
    sale.restore(entry, medById);
    setHeldOpen(false);
  };

  // ---------- Checkout ----------
  const { checkoutLoading, handleCheckout } = usePosCheckout({
    t, sale, pharmacyId, userId, online, hasControlled, needsRx, totals, effectivePayments, payStatus,
    blockers, shiftState, requireShiftUi, setMedicines, loadCatalogData, loadShift,
    setError, setInfo, setShiftModal, setCompletedSale, clinicalAck,
  });

  const clearWithConfirm = () => {
    if (cart.length === 0) return;
    if (window.confirm(hasPendingIntent ? t('payment.confirmCancelPending') : t('cart.confirmClear'))) resetSale();
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

      <OfflinePanel
        online={online}
        pending={pending}
        failed={failed}
        othersCount={othersPending.length + othersFailed.length}
        syncing={syncing}
        onSync={syncNow}
        catalogSavedAt={catalogSavedAt}
      />

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
        <PosCartPanel
          sale={sale}
          online={online}
          canCredit={canCredit}
          needsRx={needsRx}
          hasControlled={hasControlled}
          severeWarnings={severeWarnings}
          clinicalFailed={clinicalStatus === 'failed'}
          warningKey={warningKey}
          totals={totals}
          payStatus={payStatus}
          allowedMethods={allowedMethods}
          providers={providers}
          insuranceLines={insuranceLines}
          maxQtyOf={maxQtyOf}
          registerQtyInput={registerQtyInput}
          blockers={blockers}
          checkoutLoading={checkoutLoading}
          onCheckout={handleCheckout}
          onHold={() => {
            if (confirmCancelPending()) setHoldOpen(true);
          }}
          onClear={clearWithConfirm}
        />
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
        autoPrint
      />
    </div>
  );
};

export default POS;
