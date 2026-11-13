// Offline sale queue (#27). Sales are stored with a client offlineId and synced in
// batches through POST /api/sales/sync, which is idempotent per offlineId.
import { getDb } from './db';
import { syncSales } from '../api/salesApi';

const SYNC_BATCH = 25;
export const QUEUE_EVENT = 'pos-offline-queue-changed';

const notify = () => {
  try {
    window.dispatchEvent(new Event(QUEUE_EVENT));
  } catch {
    // ignore
  }
};

export const newOfflineId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Fallback for very old browsers / insecure contexts
  return `off-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

// True for axios errors where the request never got a response (offline, DNS, timeout, CORS).
export const isNetworkError = (err) =>
  Boolean(
    err &&
      !err.response &&
      (err.request || err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED' || err.message === 'Network Error')
  );

export const enqueueSale = async ({ offlineId, pharmacyId, userId, payload, summary }) => {
  const db = await getDb();
  const entry = {
    offlineId,
    pharmacyId,
    userId,
    payload,
    summary: summary || null,
    createdAtClient: new Date().toISOString(),
    status: 'pending',
    error: '',
    code: '',
    attempts: 0,
  };
  await db.put('queue', entry);
  notify();
  return entry;
};

export const listQueue = async (pharmacyId) => {
  try {
    const db = await getDb();
    const all = await db.getAllFromIndex('queue', 'pharmacyId', pharmacyId);
    return all.sort((a, b) => String(a.createdAtClient).localeCompare(String(b.createdAtClient)));
  } catch {
    return [];
  }
};

export const removeFromQueue = async (offlineId) => {
  const db = await getDb();
  await db.delete('queue', offlineId);
  notify();
};

// Puts a failed entry back to pending (it will be retried on the next sync).
export const retryEntry = async (offlineId) => {
  const db = await getDb();
  const entry = await db.get('queue', offlineId);
  if (!entry) return;
  await db.put('queue', { ...entry, status: 'pending', error: '', code: '' });
  notify();
};

let syncing = null;

// Syncs the pending sales of this pharmacy made by this user (the server attributes
// synced sales to the signed-in user). Returns { synced, failed, remaining } or null when skipped.
export const syncQueue = async ({ pharmacyId, userId }) => {
  if (!pharmacyId || (typeof navigator !== 'undefined' && navigator.onLine === false)) return null;
  if (syncing) return syncing;
  syncing = (async () => {
    let synced = 0;
    let failed = 0;
    const db = await getDb();
    const pending = (await listQueue(pharmacyId)).filter(
      (e) => e.status === 'pending' && (!userId || !e.userId || String(e.userId) === String(userId))
    );
    for (let i = 0; i < pending.length; i += SYNC_BATCH) {
      const batch = pending.slice(i, i + SYNC_BATCH);
      let res;
      try {
        res = await syncSales(
          batch.map((e) => ({ offlineId: e.offlineId, payload: e.payload, createdAtClient: e.createdAtClient }))
        );
      } catch (err) {
        if (isNetworkError(err)) break; // still offline: keep everything pending
        // Whole request rejected (e.g. 403): mark the batch as failed so it can be reviewed
        const message = err.response?.data?.message || 'Sync failed';
        for (const e of batch) {
          await db.put('queue', { ...e, status: 'failed', error: message, attempts: (e.attempts || 0) + 1 });
          failed += 1;
        }
        continue;
      }
      const byId = new Map((res.results || []).map((r) => [r.offlineId, r]));
      for (const e of batch) {
        const r = byId.get(e.offlineId);
        if (r && (r.status === 'created' || r.status === 'duplicate')) {
          await db.delete('queue', e.offlineId);
          synced += 1;
        } else {
          await db.put('queue', {
            ...e,
            status: 'failed',
            error: r?.message || 'Not processed',
            code: r?.code || '',
            attempts: (e.attempts || 0) + 1,
          });
          failed += 1;
        }
      }
    }
    const remaining = (await listQueue(pharmacyId)).length;
    notify();
    return { synced, failed, remaining };
  })();
  try {
    return await syncing;
  } finally {
    syncing = null;
  }
};
