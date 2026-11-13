// Pure checkout helpers for the POS: sale blockers, the createSale payload and the
// provisional receipt shown for a sale saved offline.
import { round2 } from './posUtils';

export const SEVERE = ['major', 'contraindicated'];

/**
 * Reasons the current sale cannot be completed yet (deduplicated, in display order).
 * `t` is a translator for the `pos` namespace.
 */
export const computeBlockers = ({
  t, cart, shiftState, requireShiftUi, hasControlled, online, can, patient, prescription, needsRx, legacyRx,
  clinicalStatus = 'ok', warningsAcked, payStatus, effectivePayments, allowedMethods, customer,
}) => {
  const list = [];
  if (cart.length === 0) return list;
  if (shiftState.loaded && !shiftState.shift && requireShiftUi) list.push(t('blockers.openShift'));
  if (hasControlled) {
    if (!online) list.push(t('blockers.controlledOffline'));
    else if (!can('controlled:dispense')) list.push(t('blockers.controlledRole'));
    else if (!patient || !prescription) list.push(t('blockers.controlledNeeds'));
  }
  if (needsRx && !prescription && !(legacyRx.number.trim() && legacyRx.prescriber.trim())) {
    list.push(t('blockers.rxRequired'));
  }
  // Allergy / interaction check of the current cart: still running, failed (retry or confirm a
  // manual check), or severe warnings not yet acknowledged.
  if (clinicalStatus === 'checking') list.push(t('blockers.clinicalChecking'));
  else if (clinicalStatus === 'failed') list.push(t('blockers.clinicalFailed'));
  if (!warningsAcked) list.push(t('blockers.reviewWarnings'));
  if (!payStatus.covered) list.push(payStatus.invalidExcess ? t('blockers.onlyCashExcess') : t('blockers.notCovered'));
  effectivePayments.forEach((p) => {
    if (!allowedMethods.includes(p.method)) list.push(t('blockers.methodUnavailable', { method: t(`methods.${p.method}`) }));
    if (p.method === 'credit' && !customer) list.push(t('blockers.creditCustomer'));
    if (p.method === 'insurance') {
      if (!online) list.push(t('blockers.insuranceOffline'));
      else if (!p.schemeId || !p.member) list.push(t('blockers.insuranceMember'));
      else if (!p.preview || !(p.amount > 0)) list.push(p.error || t('blockers.insurancePreview'));
    }
    if (p.method === 'mobile_money' && p.amount > 0) {
      if (p.intentId && p.intentStatus !== 'confirmed') list.push(t('blockers.waitingMobile'));
      if (!p.intentId && !p.reference.trim()) list.push(t('blockers.mobileRef'));
    }
  });
  return [...new Set(list)];
};

// Body for POST /api/sales
export const buildSalePayload = ({
  cart, customer, walkIn, patient, prescription, needsRx, legacyRx, totals, effectivePayments, offlineId, clinicalAck = false,
}) => ({
  // unitPrice / clientTotal are only used by the server for offline sync (prices on the device)
  items: cart.map((l) => ({ medicineId: l.medicineId, quantity: l.quantity, unitName: l.unit.name, unitPrice: l.unit.price })),
  clientTotal: totals.grandTotal,
  ...(clinicalAck ? { clinicalAck: true } : {}),
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
      // Insurance: the server recomputes the insurer share from the scheme rules
      ...(p.method === 'insurance' ? { schemeId: p.schemeId, memberId: p.member?._id } : {}),
    })),
  offlineId,
});

// Provisional receipt for a sale saved offline. `t` translates the `pos` namespace.
export const buildProvisionalSale = ({ t, offlineId, payload, cart, walkIn, totals, payStatus }) => ({
  _id: offlineId,
  invoiceNumber: `OFFLINE-${offlineId.slice(0, 8).toUpperCase()}`,
  createdAt: new Date().toISOString(),
  customer: { name: walkIn.name.trim() || t('provisional.walkIn'), phone: walkIn.phone.trim() },
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
  notes: t('provisional.notes'),
  offlinePending: payload.offlineId,
});
