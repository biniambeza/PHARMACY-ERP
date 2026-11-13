// Held / parked sales of the POS, persisted in localStorage per pharmacy + user.
import { useState } from 'react';
import { newOfflineId } from '../../offline/queue';
import { loadHeld, saveHeld } from './posUtils';

const entryOf = (data) => ({ id: newOfflineId(), createdAt: new Date().toISOString(), ...data });

/**
 * Returns { held, hold(data), take(id, autoHold), remove(id) }.
 *   data / autoHold: { label, cart, customer, walkIn, patient, prescription, legacyRx, discount, total }
 *   take(): removes the entry being resumed; when `autoHold` is given it is parked first.
 */
export const useHeldSales = ({ pharmacyId, userId }) => {
  const [held, setHeld] = useState(() => loadHeld(pharmacyId, userId));

  const update = (next) => {
    setHeld(next);
    saveHeld(pharmacyId, userId, next);
  };

  const hold = (data) => update([entryOf(data), ...held]);

  const take = (id, autoHold) => {
    let next = held.filter((h) => h.id !== id);
    if (autoHold) next = [entryOf(autoHold), ...next];
    update(next);
  };

  const remove = (id) => update(held.filter((h) => h.id !== id));

  return { held, hold, take, remove };
};

export default useHeldSales;
