// Demo data seeder: suppliers, medicines, stock batches, purchase orders and sales
// for one pharmacy. Data is consistent with what the app itself writes:
//   - every stock batch gets a 'stock_in' movement, every sale line a 'sale' movement
//     (utils/stockMovement.recordMovement) and reduces the batch it sold from;
//   - invoice / PO numbers come from the per-pharmacy Counter (utils/sequence), so
//     later POS sales and POs continue the same sequence without collisions;
//   - sales carry staffId, items[].costPrice, payments[] and amountPaid.
// Idempotent: each section is skipped when that kind of data already exists.
//
//   npm run seed:demo                         # first active pharmacy
//   npm run seed:demo -- --pharmacy=<id>      # a specific pharmacy
//   NODE_ENV=production ... --force           # refuses in production without --force
const path = require('path');
const mongoose = require('mongoose');
const Pharmacy = require('../models/Pharmacy');
const User = require('../models/User');
const Medicine = require('../models/Medicine');
const StockBatch = require('../models/StockBatch');
const Supplier = require('../models/Supplier');
const PurchaseOrder = require('../models/PurchaseOrder');
const Sale = require('../models/Sale');
const { recordMovement } = require('./stockMovement');
const { nextSequence, formatSequence } = require('./sequence');

const DAY_MS = 24 * 60 * 60 * 1000;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const SUPPLIERS = [
  { name: 'EPSA (Ethiopian Pharma Supply)', contactPerson: 'Dr. Tadesse Kebede', phone: '0112750000', email: 'epsa@gov.et', address: 'Addis Ababa' },
  { name: 'Addis Pharmaceuticals Factory', contactPerson: 'Almaz Hailu', phone: '0114421111', email: 'sales@apf.com.et', address: 'Adigrat / Addis' },
  { name: 'Cadila Pharma Ethiopia', contactPerson: 'Rajesh Sharma', phone: '0116632222', email: 'contact@cadila.et', address: 'Bishoftu' },
  { name: 'Medtech Ethiopia Distributor', contactPerson: 'Dawit Abebe', phone: '0115513333', email: 'info@medtech.et', address: 'Addis Ababa' },
  { name: 'Julphar Pharmaceuticals', contactPerson: 'Sara Mohammed', phone: '0116624444', email: 'orders@julphar.et', address: 'Addis Ababa' },
];

const MEDICINES = [
  { name: 'Amoxicillin 500mg', genericName: 'Amoxicillin Trihydrate', category: 'Antibiotics', dosageForm: 'Capsule', strength: '500mg', price: 12.5, costPrice: 8.0, minStockLevel: 50, requiresPrescription: true },
  { name: 'Paracetamol 500mg', genericName: 'Acetaminophen', category: 'Analgesics', dosageForm: 'Tablet', strength: '500mg', price: 4.0, costPrice: 2.2, minStockLevel: 100, requiresPrescription: false },
  { name: 'Omeprazole 20mg', genericName: 'Omeprazole', category: 'Gastrointestinal', dosageForm: 'Capsule', strength: '20mg', price: 18.0, costPrice: 11.5, minStockLevel: 40, requiresPrescription: false },
  { name: 'Metformin 500mg', genericName: 'Metformin HCl', category: 'Antidiabetic', dosageForm: 'Tablet', strength: '500mg', price: 8.5, costPrice: 5.0, minStockLevel: 60, requiresPrescription: true },
  { name: 'Ciprofloxacin 500mg', genericName: 'Ciprofloxacin HCl', category: 'Antibiotics', dosageForm: 'Tablet', strength: '500mg', price: 22.0, costPrice: 14.0, minStockLevel: 30, requiresPrescription: true },
  { name: 'Atorvastatin 20mg', genericName: 'Atorvastatin Calcium', category: 'Cardiovascular', dosageForm: 'Tablet', strength: '20mg', price: 32.0, costPrice: 20.0, minStockLevel: 25, requiresPrescription: true },
  { name: 'Ibuprofen 400mg', genericName: 'Ibuprofen', category: 'Anti-inflammatory', dosageForm: 'Tablet', strength: '400mg', price: 6.5, costPrice: 3.8, minStockLevel: 50, requiresPrescription: false },
  { name: 'Azithromycin 500mg', genericName: 'Azithromycin Dihydrate', category: 'Antibiotics', dosageForm: 'Tablet', strength: '500mg', price: 45.0, costPrice: 28.0, minStockLevel: 20, requiresPrescription: true },
  { name: 'Losartan 50mg', genericName: 'Losartan Potassium', category: 'Cardiovascular', dosageForm: 'Tablet', strength: '50mg', price: 24.0, costPrice: 15.0, minStockLevel: 35, requiresPrescription: true },
  { name: 'Cetirizine 10mg', genericName: 'Cetirizine Di-HCl', category: 'Antihistamines', dosageForm: 'Tablet', strength: '10mg', price: 7.0, costPrice: 4.2, minStockLevel: 45, requiresPrescription: false },
  { name: 'Salbutamol Inhaler', genericName: 'Albuterol Sulfate', category: 'Respiratory', dosageForm: 'Inhaler', strength: '100mcg/dose', price: 85.0, costPrice: 55.0, minStockLevel: 15, requiresPrescription: true },
  { name: 'Oral Rehydration Salts (ORS)', genericName: 'Electrolyte Formula', category: 'Gastrointestinal', dosageForm: 'Other', strength: 'Sachet 20.5g', price: 5.0, costPrice: 2.8, minStockLevel: 80, requiresPrescription: false },
];

const CUSTOMERS = [
  { name: 'Abebe Bikila', phone: '0911223344' },
  { name: 'Sara Tefera', phone: '0922334455' },
  { name: 'Daniel Gizaw', phone: '0933445566' },
  { name: 'Marta Worku', phone: '0944556677' },
  { name: 'Kassahun Desta', phone: '0955667788' },
  { name: 'Walk-in Customer', phone: '' },
];

/** Throws unless seeding is allowed in this environment. */
const assertSeedAllowed = ({ env = process.env, force = false } = {}) => {
  if (env.NODE_ENV === 'production' && !force) {
    throw new Error('Refusing to seed demo data with NODE_ENV=production. Pass --force if you really mean it.');
  }
  return true;
};

async function findOrCreate(Model, filter, data) {
  const existing = await Model.findOne(filter);
  return existing || Model.create(data);
}

async function seedSuppliers(pharmacyId) {
  const out = [];
  for (const sup of SUPPLIERS) out.push(await findOrCreate(Supplier, { pharmacyId, name: sup.name }, { ...sup, pharmacyId }));
  return out;
}

async function seedMedicines(pharmacyId) {
  const out = [];
  for (const med of MEDICINES) out.push(await findOrCreate(Medicine, { pharmacyId, name: med.name }, { ...med, pharmacyId }));
  return out;
}

async function seedBatches({ pharmacyId, userId, meds, now }) {
  if ((await StockBatch.countDocuments({ pharmacyId })) > 0) return 0;
  const docs = [];
  meds.forEach((med, idx) => {
    const safeExpiry = new Date(now);
    safeExpiry.setFullYear(now.getFullYear() + 1);
    safeExpiry.setMonth(idx % 12);
    const qty = 150 + idx * 15;
    docs.push({ medicine: med, batchNo: `LOT-${now.getFullYear()}${String(idx + 1).padStart(3, '0')}-A`, quantity: qty, expiryDate: safeExpiry });
    // Near-expiry batches (18-24 days) to trigger real FEFO / expiry alerts.
    if (idx === 0 || idx === 3 || idx === 6) {
      docs.push({
        medicine: med,
        batchNo: `LOT-${now.getFullYear()}${String(idx + 1).padStart(3, '0')}-EXP`,
        quantity: 40,
        expiryDate: new Date(now.getTime() + (18 + idx) * DAY_MS),
      });
    }
  });

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const d of docs) {
        const [batch] = await StockBatch.create(
          [
            {
              pharmacyId,
              medicineId: d.medicine._id,
              batchNo: d.batchNo,
              quantity: d.quantity,
              initialQuantity: d.quantity,
              expiryDate: d.expiryDate,
              purchasePrice: d.medicine.costPrice,
              status: 'active',
            },
          ],
          { session }
        );
        await recordMovement(
          {
            pharmacyId,
            batchId: batch._id,
            medicineId: d.medicine._id,
            type: 'stock_in',
            quantityChange: d.quantity,
            balanceAfter: d.quantity,
            reason: 'Demo data: opening stock',
            userId,
          },
          { session }
        );
      }
    });
  } finally {
    await session.endSession();
  }
  return docs.length;
}

async function seedPurchaseOrders({ pharmacyId, userId, meds, suppliers, now }) {
  if ((await PurchaseOrder.countDocuments({ pharmacyId })) > 0) return 0;
  const ago = (days) => new Date(now.getTime() - days * DAY_MS);
  const line = (med, qty, received) => ({
    medicineId: med._id,
    name: med.name,
    quantityOrdered: qty,
    unitCost: med.costPrice,
    subtotal: round2(qty * med.costPrice),
    quantityReceived: received ? qty : 0,
  });
  const plans = [
    { supplier: suppliers[0], items: [[meds[0], 200], [meds[1], 500]], status: 'received', orderDate: ago(14), receivedDate: ago(7) },
    { supplier: suppliers[1], items: [[meds[2], 100], [meds[3], 150]], status: 'ordered', orderDate: ago(3), expectedDelivery: ago(-4) },
    { supplier: suppliers[2], items: [[meds[4], 80], [meds[5], 60]], status: 'ordered', orderDate: ago(1), expectedDelivery: ago(-6) },
    { supplier: suppliers[3], items: [[meds[7], 50]], status: 'received', orderDate: ago(20), receivedDate: ago(15) },
  ];
  for (const plan of plans) {
    const items = plan.items.map(([med, qty]) => line(med, qty, plan.status === 'received'));
    const seq = await nextSequence(pharmacyId, 'po');
    await PurchaseOrder.create({
      pharmacyId,
      pharmacistId: userId,
      supplierId: plan.supplier._id,
      poNumber: formatSequence('PO', seq, plan.orderDate),
      items,
      totalAmount: round2(items.reduce((s, i) => s + i.subtotal, 0)),
      status: plan.status,
      orderDate: plan.orderDate,
      expectedDelivery: plan.expectedDelivery,
      receivedDate: plan.receivedDate,
      notes: 'Demo data',
    });
  }
  return plans.length;
}

// One sale in a transaction: FEFO batch per line, conditional decrement, movements.
async function createSale({ pharmacyId, userId, lines, customer, method, saleDate, now }) {
  const session = await mongoose.startSession();
  try {
    let sale = null;
    await session.withTransaction(async () => {
      const items = [];
      const movements = [];
      for (const { medicine, quantity } of lines) {
        const batch = await StockBatch.findOne({
          pharmacyId,
          medicineId: medicine._id,
          status: 'active',
          quantity: { $gte: quantity },
          expiryDate: { $gt: now },
        })
          .sort({ expiryDate: 1 })
          .session(session);
        if (!batch) continue; // not enough stock: skip this line
        const updated = await StockBatch.findOneAndUpdate(
          { _id: batch._id, quantity: { $gte: quantity } },
          { $inc: { quantity: -quantity } },
          { returnDocument: 'after', session }
        );
        if (!updated) continue;
        if (updated.quantity === 0) {
          await StockBatch.updateOne({ _id: updated._id, quantity: 0, status: 'active' }, { $set: { status: 'depleted' } }, { session });
        }
        items.push({
          medicineId: medicine._id,
          name: medicine.name,
          batchId: batch._id,
          batchNo: batch.batchNo,
          quantity,
          unitPrice: medicine.price,
          subtotal: round2(quantity * medicine.price),
          unitName: 'unit',
          unitFactor: 1,
          taxAmount: 0,
          costPrice: round2(batch.purchasePrice),
        });
        movements.push({ batchId: batch._id, medicineId: medicine._id, quantityChange: -quantity, balanceAfter: updated.quantity });
      }
      if (!items.length) return;

      const grandTotal = round2(items.reduce((s, i) => s + i.subtotal, 0));
      const seq = await nextSequence(pharmacyId, 'invoice', { session });
      const [created] = await Sale.create(
        [
          {
            pharmacyId,
            pharmacistId: userId,
            staffId: userId,
            invoiceNumber: formatSequence('INV', seq, saleDate),
            customer,
            items,
            subtotal: grandTotal,
            discount: 0,
            tax: 0,
            grandTotal,
            paymentMethod: method,
            payments: [{ method, amount: grandTotal, status: 'completed' }],
            amountPaid: grandTotal,
            balanceDue: 0,
            paymentStatus: 'paid',
            notes: 'Demo data',
            createdAt: saleDate,
            updatedAt: saleDate,
          },
        ],
        { session, timestamps: false }
      );
      for (const m of movements) {
        await recordMovement(
          { pharmacyId, ...m, type: 'sale', userId, refId: created._id, refModel: 'Sale', createdAt: saleDate, updatedAt: saleDate },
          { session }
        );
      }
      sale = created;
    });
    return sale;
  } finally {
    await session.endSession();
  }
}

async function seedSales({ pharmacyId, userId, meds, now }) {
  if ((await Sale.countDocuments({ pharmacyId })) > 0) return 0;
  let created = 0;
  for (let i = 0; i < 16; i += 1) {
    // Spread across the past 8 days, oldest first so invoice numbers follow the dates.
    const n = 15 - i;
    const saleDate = new Date(now.getTime() - Math.floor(n / 2) * DAY_MS - (n % 8) * 3600 * 1000);
    const sale = await createSale({
      pharmacyId,
      userId,
      lines: [
        { medicine: meds[n % meds.length], quantity: (n % 3) + 1 },
        { medicine: meds[(n + 3) % meds.length], quantity: (n % 2) + 1 },
      ],
      customer: CUSTOMERS[n % CUSTOMERS.length],
      method: ['cash', 'card', 'mobile_money'][n % 3],
      saleDate,
      now,
    });
    if (sale) created += 1;
  }
  return created;
}

/**
 * Seed demo data into an already-connected database.
 * @returns {Promise<{ pharmacyId, suppliers, medicines, batches, purchaseOrders, sales }>}
 */
async function seedPharmacyData({ pharmacyId, now = new Date(), log = () => {} } = {}) {
  const pharmacy = pharmacyId ? await Pharmacy.findById(pharmacyId) : await Pharmacy.findOne({ status: 'active' });
  if (!pharmacy) throw new Error(pharmacyId ? `Pharmacy ${pharmacyId} not found` : 'No active pharmacy found to seed');

  const staff =
    (pharmacy.owner && (await User.findById(pharmacy.owner))) ||
    (await User.findOne({ 'memberships.pharmacyId': pharmacy._id })) ||
    null;
  if (!staff) throw new Error(`No staff user found for pharmacy "${pharmacy.name}"`);

  const pid = pharmacy._id;
  const userId = staff._id;
  log(`Seeding demo data for pharmacy "${pharmacy.name}" (${pid}) as ${staff.email || staff._id}`);

  const suppliers = await seedSuppliers(pid);
  log(`  suppliers ready: ${suppliers.length}`);
  const meds = await seedMedicines(pid);
  log(`  medicines ready: ${meds.length}`);
  const batches = await seedBatches({ pharmacyId: pid, userId, meds, now });
  log(batches ? `  stock batches created: ${batches}` : '  stock batches: already present, skipped');
  const purchaseOrders = await seedPurchaseOrders({ pharmacyId: pid, userId, meds, suppliers, now });
  log(purchaseOrders ? `  purchase orders created: ${purchaseOrders}` : '  purchase orders: already present, skipped');
  const sales = await seedSales({ pharmacyId: pid, userId, meds, now });
  log(sales ? `  sales created: ${sales}` : '  sales: already present, skipped');

  return { pharmacyId: pid, suppliers: suppliers.length, medicines: meds.length, batches, purchaseOrders, sales };
}

async function main() {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
  const argv = process.argv.slice(2);
  const force = argv.includes('--force');
  const pharmacyArg = argv.find((a) => a.startsWith('--pharmacy='));
  assertSeedAllowed({ force });
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set (backend/.env)');
  await mongoose.connect(process.env.MONGO_URI);
  try {
    await seedPharmacyData({
      pharmacyId: pharmacyArg ? pharmacyArg.split('=')[1] : undefined,
      log: (line) => console.log(line),
    });
    console.log('Demo data seeding complete.');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`Seeding error: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { seedPharmacyData, assertSeedAllowed };
