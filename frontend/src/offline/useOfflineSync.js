// React hook: online/offline state + the offline sale queue, with background sync on the
// 'online' event and on an interval. Mounted once by OfflineSyncProvider (pharmacy layout), so
// queued sales sync from any page; components read it with useOfflineSyncContext().
import { useCallback, useEffect, useRef, useState } from 'react';
import { listQueue, syncQueue, isOwnEntry, QUEUE_EVENT } from './queue';

const SYNC_INTERVAL_MS = 30000;

export const useOnlineStatus = () => {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
};

/**
 * Returns { online, queue, pending, failed, othersPending, othersFailed, syncing, lastResult, syncNow, refresh }.
 *   pending / failed: entries of the signed-in user (only these are synced: the server
 *     attributes synced sales to the signed-in user)
 *   othersPending / othersFailed: entries other users left on this device
 *   onSynced(result): called after a sync that created at least one sale
 */
export const useOfflineSync = ({ pharmacyId, userId, onSynced } = {}) => {
  const online = useOnlineStatus();
  const [queue, setQueue] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const onSyncedRef = useRef(onSynced);
  useEffect(() => {
    onSyncedRef.current = onSynced;
  }, [onSynced]);

  const refresh = useCallback(async () => {
    if (!pharmacyId) return;
    setQueue(await listQueue(pharmacyId));
  }, [pharmacyId]);

  const syncNow = useCallback(async () => {
    if (!pharmacyId || !userId) return null;
    setSyncing(true);
    try {
      const result = await syncQueue({ pharmacyId, userId });
      if (result) {
        setLastResult({ ...result, at: new Date() });
        if (result.synced > 0) onSyncedRef.current?.(result);
      }
      return result;
    } catch {
      return null;
    } finally {
      setSyncing(false);
      refresh();
    }
  }, [pharmacyId, userId, refresh]);

  useEffect(() => {
    const t = setTimeout(refresh, 0);
    const onChange = () => refresh();
    window.addEventListener(QUEUE_EVENT, onChange);
    return () => {
      clearTimeout(t);
      window.removeEventListener(QUEUE_EVENT, onChange);
    };
  }, [refresh]);

  // Sync when the connection comes back, and periodically while online
  useEffect(() => {
    if (!online) return undefined;
    const first = setTimeout(syncNow, 1000);
    const timer = setInterval(syncNow, SYNC_INTERVAL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [online, syncNow]);

  const mine = queue.filter((e) => isOwnEntry(e, userId));
  const others = queue.filter((e) => !isOwnEntry(e, userId));

  return {
    online,
    queue,
    pending: mine.filter((e) => e.status === 'pending'),
    failed: mine.filter((e) => e.status === 'failed'),
    othersPending: others.filter((e) => e.status === 'pending'),
    othersFailed: others.filter((e) => e.status === 'failed'),
    syncing,
    lastResult,
    syncNow,
    refresh,
  };
};
