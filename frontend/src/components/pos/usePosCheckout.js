// Checkout flow of the POS: online sale, or a queued offline sale when the network is down.
import { useState } from 'react';
import { createSale } from '../../api/salesApi';
import { decrementCachedStock } from '../../offline/catalogCache';
import { enqueueSale, newOfflineId, isNetworkError } from '../../offline/queue';
import { errMsg } from './posUtils';
import { buildSalePayload, buildProvisionalSale } from './posCheckout';

/**
 * Returns { checkoutLoading, handleCheckout }.
 * `sale` is the object from usePosSale; the rest is page context.
 */
export const usePosCheckout = ({
  t, sale, pharmacyId, userId, online, hasControlled, needsRx, totals, effectivePayments, payStatus,
  blockers, shiftState, requireShiftUi, setMedicines, loadCatalogData, loadShift,
  setError, setInfo, setShiftModal, setCompletedSale,
}) => {
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const { cart, customer, walkIn, patient, prescription, legacyRx, offlineIdRef, resetSale } = sale;

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

  return { checkoutLoading, handleCheckout };
};
