// Catalog, pharmacy settings, current shift, quick picks and payment providers for the POS.
// Falls back to the cached catalog / shift when offline (#27).
import { useCallback, useEffect, useRef, useState } from 'react';
import i18n from '../../i18n';
import { getMyPharmacy } from '../../api/pharmacyApi';
import { getPosCatalog, getTopItems } from '../../api/salesApi';
import { getCurrentShift } from '../../api/shiftApi';
import { getPaymentProviders } from '../../api/paymentApi';
import { saveCatalog, loadCatalog } from '../../offline/catalogCache';
import { isNetworkError } from '../../offline/queue';
import { cacheShift, loadCachedShift, errMsg } from './posUtils';

/**
 * Props: { pharmacyId, userId, setError(msg), setShiftModal(bool) }
 * Returns catalog/shift state plus loadCatalogData() and loadShift() to refresh them.
 */
export const usePosData = ({ pharmacyId, userId, setError, setShiftModal }) => {
  const [pharmacy, setPharmacy] = useState(null);
  const [medicines, setMedicines] = useState([]);
  const [catalogSavedAt, setCatalogSavedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [topIds, setTopIds] = useState([]);
  const [providers, setProviders] = useState({ default: 'manual', providers: [{ name: 'manual', label: 'Manual', flow: 'manual', configured: true }] });
  const [shiftState, setShiftState] = useState({ loaded: false, shift: null, requireShift: false });
  const promptedShift = useRef(false);

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
        if (!isNetworkError(err)) setError(errMsg(err, i18n.t('pos:errors.loadCatalog')));
      }
    }
    const cached = await loadCatalog(pharmacyId);
    if (cached) {
      setMedicines(cached.medicines || []);
      setPharmacy(cached.pharmacy || null);
      setCatalogSavedAt(cached.savedAt);
    } else if (!isOnline) {
      setError(i18n.t('pos:errors.offlineNoCatalog'));
    }
  }, [pharmacyId, setError]);

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
  }, [pharmacyId, userId, setShiftModal]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(loadShift, 0);
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
      clearTimeout(timer);
    };
  }, [loadCatalogData, loadShift]);

  return {
    pharmacy, medicines, setMedicines, catalogSavedAt, loading, topIds, providers,
    shiftState, setShiftState, loadCatalogData, loadShift,
  };
};

export default usePosData;
