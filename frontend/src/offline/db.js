// IndexedDB storage for the offline POS (#27).
//   catalog: one record per pharmacy -> { pharmacyId, medicines, pharmacy, savedAt }
//   queue:   sales waiting to be synced -> { offlineId, pharmacyId, userId, payload, createdAtClient,
//            status: 'pending'|'failed', error, code, attempts, summary }
import { openDB } from 'idb';

const DB_NAME = 'pharmacy-erp-pos';
const DB_VERSION = 1;

let dbPromise = null;

export const getDb = () => {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is not available'));
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('catalog')) {
          db.createObjectStore('catalog', { keyPath: 'pharmacyId' });
        }
        if (!db.objectStoreNames.contains('queue')) {
          const store = db.createObjectStore('queue', { keyPath: 'offlineId' });
          store.createIndex('pharmacyId', 'pharmacyId');
        }
      },
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
};
