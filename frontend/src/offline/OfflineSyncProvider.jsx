import { useCallback, useRef, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useOfflineSync } from './useOfflineSync';
import { OfflineSyncContext } from './offlineSyncContext';
import UnsyncedSalesDialog from '../components/layout/UnsyncedSalesDialog';

/**
 * Runs the offline sale sync for the active branch + signed-in user on every pharmacy page
 * (not only the POS) and provides it through OfflineSyncContext (see offlineSyncContext.js).
 * Also renders the "sales not yet synced" confirmation used before logout / branch switch.
 */
const OfflineSyncProvider = ({ children }) => {
  const { user, activePharmacyId } = useAuth();
  const listeners = useRef(new Set());
  const onSynced = useCallback((result) => {
    listeners.current.forEach((fn) => {
      try {
        fn(result);
      } catch {
        // a listener error must not stop the others
      }
    });
  }, []);

  const sync = useOfflineSync({ pharmacyId: activePharmacyId || 'default', userId: user?._id, onSynced });

  const subscribeSynced = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  // { kind, resolve } while the confirmation is open
  const [ask, setAsk] = useState(null);
  const unsyncedCount = sync.pending.length + sync.failed.length;
  const confirmUnsynced = useCallback(
    (kind) => {
      if (unsyncedCount === 0) return Promise.resolve(true);
      return new Promise((resolve) => setAsk({ kind, resolve }));
    },
    [unsyncedCount]
  );
  const answer = (ok) => {
    ask?.resolve(ok);
    setAsk(null);
  };

  const value = { ...sync, unsyncedCount, subscribeSynced, confirmUnsynced };

  return (
    <OfflineSyncContext.Provider value={value}>
      {children}
      <UnsyncedSalesDialog
        open={Boolean(ask)}
        kind={ask?.kind}
        count={unsyncedCount}
        othersCount={sync.othersPending.length + sync.othersFailed.length}
        online={sync.online}
        syncing={sync.syncing}
        onSync={sync.syncNow}
        onCancel={() => answer(false)}
        onContinue={() => answer(true)}
      />
    </OfflineSyncContext.Provider>
  );
};

export default OfflineSyncProvider;
