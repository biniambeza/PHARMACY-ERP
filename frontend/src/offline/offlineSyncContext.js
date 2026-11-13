import { createContext, useContext } from 'react';

// Value: useOfflineSync() result plus
//   subscribeSynced(fn) -> unsubscribe   (fn(result) after a sync that created sales)
//   confirmUnsynced('logout' | 'switchBranch') -> Promise<boolean>
//     resolves true right away when the signed-in user has no unsynced sales, otherwise asks.
// null outside OfflineSyncProvider (the pharmacy layout).
export const OfflineSyncContext = createContext(null);

export const useOfflineSyncContext = () => useContext(OfflineSyncContext);
