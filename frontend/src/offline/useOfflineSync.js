// React hook: online/offline state + the offline sale queue, with background sync on the
// 'online' event and on an interval.
import { useCallback, useEffect, useRef, useState } from 'react';
import { listQueue, syncQueue, QUEUE_EVENT } from './queue';

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
    if (!pharmacyId) return null;
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

  const pending = queue.filter((e) => e.status === 'pending');
  const failed = queue.filter((e) => e.status === 'failed');

  return { online, queue, pending, failed, syncing, lastResult, syncNow, refresh };
};
