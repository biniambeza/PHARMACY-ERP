import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getMyPharmacy } from '../api/pharmacyApi';
import { applyPharmacySettings } from './index';

/**
 * Renders nothing. Mount once inside AuthProvider (e.g. in PharmacyLayout):
 * loads the active pharmacy's settings and applies its currency and default
 * language (the language only when the user has not chosen one explicitly).
 */
export default function LocaleSync() {
  const { user, activePharmacyId } = useAuth();
  const isTenant = user?.role === 'pharmacist';

  useEffect(() => {
    if (!isTenant || !activePharmacyId) return undefined;
    let cancelled = false;
    getMyPharmacy()
      .then((data) => {
        if (!cancelled) applyPharmacySettings(data?.pharmacy?.settings);
      })
      .catch(() => {
        /* non-fatal: keep defaults */
      });
    return () => {
      cancelled = true;
    };
  }, [isTenant, activePharmacyId]);

  return null;
}
