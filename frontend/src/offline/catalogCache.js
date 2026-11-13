// Offline cache of the POS catalog (medicines + sellable stock snapshot) and pharmacy settings.
import { getDb } from './db';

export const saveCatalog = async (pharmacyId, { medicines, pharmacy }) => {
  if (!pharmacyId) return;
  try {
    const db = await getDb();
    const existing = await db.get('catalog', pharmacyId);
    await db.put('catalog', {
      pharmacyId,
      medicines: medicines ?? existing?.medicines ?? [],
      pharmacy: pharmacy ?? existing?.pharmacy ?? null,
      savedAt: new Date().toISOString(),
    });
  } catch {
    // Storage unavailable (private mode, quota): the POS still works online
  }
};

export const loadCatalog = async (pharmacyId) => {
  if (!pharmacyId) return null;
  try {
    const db = await getDb();
    return (await db.get('catalog', pharmacyId)) || null;
  } catch {
    return null;
  }
};

// Lowers the cached stock after a sale made offline: [{ medicineId, baseQuantity }]
export const decrementCachedStock = async (pharmacyId, lines) => {
  try {
    const db = await getDb();
    const record = await db.get('catalog', pharmacyId);
    if (!record) return;
    const byId = new Map(lines.map((l) => [String(l.medicineId), l.baseQuantity]));
    record.medicines = record.medicines.map((m) =>
      byId.has(String(m._id)) ? { ...m, stock: Math.max(0, (Number(m.stock) || 0) - byId.get(String(m._id))) } : m
    );
    await db.put('catalog', record);
  } catch {
    // ignore
  }
};
