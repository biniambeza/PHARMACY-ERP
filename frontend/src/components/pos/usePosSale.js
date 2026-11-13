// State of the sale being rung up on the POS: cart lines, customer/patient, prescription,
// clinical warnings, discount and payment rows, plus the cart actions.
import { useCallback, useRef, useState } from 'react';
import { unitsOf, findUnit, baseQtyInCart, newPaymentRow } from './posUtils';

const emptyRx = { number: '', prescriber: '', notes: '' };
const emptyWalkIn = { name: '', phone: '' };
let lineSeq = 0;

export const usePosSale = ({ t, online, setError }) => {
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
  const offlineIdRef = useRef(null); // reused when a checkout is retried (idempotent)

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
    [online, cart, t, setError]
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

  // Picking no customer turns any credit payment row back into cash.
  const changeCustomer = (c) => {
    setCustomer(c);
    if (!c) setPayments((rows) => rows.map((r) => (r.method === 'credit' ? { ...r, method: 'cash' } : r)));
  };

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

  // ---------- Held (parked) sales ----------
  const snapshot = (label, total) => ({ label, cart, customer, walkIn, patient, prescription, legacyRx, discount, total });

  // Loads a held sale into the (already reset) POS, refreshing stock info from the current catalog.
  const restore = (entry, medById) => {
    setCart(entry.cart.map((l) => ({ ...l, medicine: medById.get(l.medicineId) || l.medicine })));
    setCustomer(entry.customer || null);
    setWalkIn(entry.walkIn || emptyWalkIn);
    setPatient(entry.patient || null);
    setPrescription(entry.prescription || null);
    setLegacyRx(entry.legacyRx || emptyRx);
    setDiscount(entry.discount || '');
  };

  return {
    cart, selectedKey, setSelectedKey, customer, walkIn, setWalkIn, patient, setPatient,
    prescription, setPrescription, legacyRx, setLegacyRx, warnings, setWarnings, ackKey, setAckKey,
    discount, setDiscount, payments, setPayments, offlineIdRef,
    addToCart, setQty, setUnit, removeLine, changeCustomer, resetSale, snapshot, restore,
  };
};
