// Values derived from the POS catalog, cart and payment rows (memoised).
import { useCallback, useMemo } from 'react';
import { round2, baseQtyInCart, computeTotals, paymentStatus, lineGrossAmounts } from './posUtils';

/**
 * Returns { medById, quickPicks, availableOf(med), maxQtyOf(line), totals, effectivePayments, payStatus,
 *           insuranceLines }.
 */
export const usePosDerived = ({ medicines, topIds, cart, discount, pharmacy, payments }) => {
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

  // A single payment row left empty means "pay the exact total with it" (never for insurance:
  // its amount is the insurer share from the coverage preview)
  const effectivePayments = useMemo(
    () =>
      payments.map((p) => ({
        ...p,
        amount:
          payments.length === 1 && p.amount === '' && p.method !== 'insurance'
            ? totals.grandTotal
            : round2(Number(p.amount) || 0),
      })),
    [payments, totals.grandTotal]
  );
  const payStatus = useMemo(() => paymentStatus(effectivePayments, totals.grandTotal), [effectivePayments, totals.grandTotal]);

  // Cart lines as the server prices them for insurance (after discount share + exclusive tax)
  const insuranceLines = useMemo(() => lineGrossAmounts(cart, totals.discount, pharmacy), [cart, totals.discount, pharmacy]);

  return { medById, quickPicks, availableOf, maxQtyOf, totals, effectivePayments, payStatus, insuranceLines };
};

export default usePosDerived;
