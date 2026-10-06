const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Pharmacy = require('../models/Pharmacy');
const User = require('../models/User');
const Medicine = require('../models/Medicine');
const StockBatch = require('../models/StockBatch');
const Supplier = require('../models/Supplier');
const PurchaseOrder = require('../models/PurchaseOrder');
const Sale = require('../models/Sale');

const seedPharmacyData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected for pharmacy data seeding...');

    // Find the pharmacy tenant
    const pharmacy = await Pharmacy.findOne({ status: 'active' });
    if (!pharmacy) {
      console.log('No active pharmacy found to seed.');
      process.exit(1);
    }

    const pharmacist = await User.findOne({ role: 'pharmacist' });
    if (!pharmacist) {
      console.log('No pharmacist user found.');
      process.exit(1);
    }

    const pharmacyId = pharmacy._id;
    const pharmacistId = pharmacist._id;
    console.log(`Seeding data for pharmacy: "${pharmacy.name}" (${pharmacyId})`);

    // 1. Suppliers
    const suppliersData = [
      { name: 'EPSA (Ethiopian Pharma Supply)', contactPerson: 'Dr. Tadesse Kebede', phone: '0112750000', email: 'epsa@gov.et', address: 'Addis Ababa' },
      { name: 'Addis Pharmaceuticals Factory', contactPerson: 'Almaz Hailu', phone: '0114421111', email: 'sales@apf.com.et', address: 'Adigrat / Addis' },
      { name: 'Cadila Pharma Ethiopia', contactPerson: 'Rajesh Sharma', phone: '0116632222', email: 'contact@cadila.et', address: 'Bishoftu' },
      { name: 'Medtech Ethiopia Distributor', contactPerson: 'Dawit Abebe', phone: '0115513333', email: 'info@medtech.et', address: 'Addis Ababa' },
      { name: 'Julphar Pharmaceuticals', contactPerson: 'Sara Mohammed', phone: '0116624444', email: 'orders@julphar.et', address: 'Addis Ababa' },
    ];

    const createdSuppliers = [];
    for (const sup of suppliersData) {
      const existing = await Supplier.findOne({ pharmacyId, name: sup.name });
      if (existing) {
        createdSuppliers.push(existing);
      } else {
        const doc = await Supplier.create({ ...sup, pharmacyId });
        createdSuppliers.push(doc);
      }
    }
    console.log(`✓ ${createdSuppliers.length} suppliers ready.`);

    // 2. Medicines Catalog
    const medicinesData = [
      { name: 'Amoxicillin 500mg', genericName: 'Amoxicillin Trihydrate', category: 'Antibiotics', dosageForm: 'Capsule', strength: '500mg', price: 12.50, costPrice: 8.00, minStockLevel: 50, requiresPrescription: true },
      { name: 'Paracetamol 500mg', genericName: 'Acetaminophen', category: 'Analgesics', dosageForm: 'Tablet', strength: '500mg', price: 4.00, costPrice: 2.20, minStockLevel: 100, requiresPrescription: false },
      { name: 'Omeprazole 20mg', genericName: 'Omeprazole', category: 'Gastrointestinal', dosageForm: 'Capsule', strength: '20mg', price: 18.00, costPrice: 11.50, minStockLevel: 40, requiresPrescription: false },
      { name: 'Metformin 500mg', genericName: 'Metformin HCl', category: 'Antidiabetic', dosageForm: 'Tablet', strength: '500mg', price: 8.50, costPrice: 5.00, minStockLevel: 60, requiresPrescription: true },
      { name: 'Ciprofloxacin 500mg', genericName: 'Ciprofloxacin HCl', category: 'Antibiotics', dosageForm: 'Tablet', strength: '500mg', price: 22.00, costPrice: 14.00, minStockLevel: 30, requiresPrescription: true },
      { name: 'Atorvastatin 20mg', genericName: 'Atorvastatin Calcium', category: 'Cardiovascular', dosageForm: 'Tablet', strength: '20mg', price: 32.00, costPrice: 20.00, minStockLevel: 25, requiresPrescription: true },
      { name: 'Ibuprofen 400mg', genericName: 'Ibuprofen', category: 'Anti-inflammatory', dosageForm: 'Tablet', strength: '400mg', price: 6.50, costPrice: 3.80, minStockLevel: 50, requiresPrescription: false },
      { name: 'Azithromycin 500mg', genericName: 'Azithromycin Dihydrate', category: 'Antibiotics', dosageForm: 'Tablet', strength: '500mg', price: 45.00, costPrice: 28.00, minStockLevel: 20, requiresPrescription: true },
      { name: 'Losartan 50mg', genericName: 'Losartan Potassium', category: 'Cardiovascular', dosageForm: 'Tablet', strength: '50mg', price: 24.00, costPrice: 15.00, minStockLevel: 35, requiresPrescription: true },
      { name: 'Cetirizine 10mg', genericName: 'Cetirizine Di-HCl', category: 'Antihistamines', dosageForm: 'Tablet', strength: '10mg', price: 7.00, costPrice: 4.20, minStockLevel: 45, requiresPrescription: false },
      { name: 'Salbutamol Inhaler', genericName: 'Albuterol Sulfate', category: 'Respiratory', dosageForm: 'Inhaler', strength: '100mcg/dose', price: 85.00, costPrice: 55.00, minStockLevel: 15, requiresPrescription: true },
      { name: 'Oral Rehydration Salts (ORS)', genericName: 'Electrolyte Formula', category: 'Gastrointestinal', dosageForm: 'Other', strength: 'Sachet 20.5g', price: 5.00, costPrice: 2.80, minStockLevel: 80, requiresPrescription: false },
    ];

    const createdMeds = [];
    for (const med of medicinesData) {
      const existing = await Medicine.findOne({ pharmacyId, name: med.name });
      if (existing) {
        createdMeds.push(existing);
      } else {
        const doc = await Medicine.create({ ...med, pharmacyId });
        createdMeds.push(doc);
      }
    }
    console.log(`✓ ${createdMeds.length} medicines registered in catalog.`);

    // 3. Stock Batches
    const existingBatchesCount = await StockBatch.countDocuments({ pharmacyId });
    if (existingBatchesCount === 0) {
      const now = new Date();
      const batchesData = [];

      createdMeds.forEach((med, idx) => {
        // Safe batch (expires next year)
        const safeExpiry = new Date();
        safeExpiry.setFullYear(now.getFullYear() + 1);
        safeExpiry.setMonth(idx % 12);

        batchesData.push({
          pharmacyId,
          medicineId: med._id,
          batchNo: `LOT-${2026}${String(idx + 1).padStart(3, '0')}-A`,
          quantity: 120 + idx * 15,
          initialQuantity: 150 + idx * 15,
          expiryDate: safeExpiry,
          purchasePrice: med.costPrice,
          status: 'active',
        });

        // Near-expiry batch for some medicines (expires in 20-25 days to trigger real FEFO alerts)
        if (idx === 0 || idx === 3 || idx === 6) {
          const nearExpiry = new Date();
          nearExpiry.setDate(now.getDate() + (18 + idx));

          batchesData.push({
            pharmacyId,
            medicineId: med._id,
            batchNo: `LOT-${2026}${String(idx + 1).padStart(3, '0')}-EXP`,
            quantity: 35,
            initialQuantity: 80,
            expiryDate: nearExpiry,
            purchasePrice: med.costPrice,
            status: 'active',
          });
        }
      });

      await StockBatch.insertMany(batchesData);
      console.log(`✓ ${batchesData.length} stock batches created with realistic FEFO expiration dates.`);
    }

    // 4. Purchase Orders
    const existingPOCount = await PurchaseOrder.countDocuments({ pharmacyId });
    if (existingPOCount === 0) {
      const samplePOs = [
        {
          pharmacyId,
          pharmacistId,
          supplierId: createdSuppliers[0]._id,
          poNumber: 'PO-2026-001',
          items: [
            { medicineId: createdMeds[0]._id, name: createdMeds[0].name, quantityOrdered: 200, unitCost: createdMeds[0].costPrice, subtotal: 200 * createdMeds[0].costPrice },
            { medicineId: createdMeds[1]._id, name: createdMeds[1].name, quantityOrdered: 500, unitCost: createdMeds[1].costPrice, subtotal: 500 * createdMeds[1].costPrice },
          ],
          totalAmount: 200 * createdMeds[0].costPrice + 500 * createdMeds[1].costPrice,
          status: 'received',
          orderDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
          receivedDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
        {
          pharmacyId,
          pharmacistId,
          supplierId: createdSuppliers[1]._id,
          poNumber: 'PO-2026-002',
          items: [
            { medicineId: createdMeds[2]._id, name: createdMeds[2].name, quantityOrdered: 100, unitCost: createdMeds[2].costPrice, subtotal: 100 * createdMeds[2].costPrice },
            { medicineId: createdMeds[3]._id, name: createdMeds[3].name, quantityOrdered: 150, unitCost: createdMeds[3].costPrice, subtotal: 150 * createdMeds[3].costPrice },
          ],
          totalAmount: 100 * createdMeds[2].costPrice + 150 * createdMeds[3].costPrice,
          status: 'ordered',
          orderDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          expectedDelivery: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
        },
        {
          pharmacyId,
          pharmacistId,
          supplierId: createdSuppliers[2]._id,
          poNumber: 'PO-2026-003',
          items: [
            { medicineId: createdMeds[4]._id, name: createdMeds[4].name, quantityOrdered: 80, unitCost: createdMeds[4].costPrice, subtotal: 80 * createdMeds[4].costPrice },
            { medicineId: createdMeds[5]._id, name: createdMeds[5].name, quantityOrdered: 60, unitCost: createdMeds[5].costPrice, subtotal: 60 * createdMeds[5].costPrice },
          ],
          totalAmount: 80 * createdMeds[4].costPrice + 60 * createdMeds[5].costPrice,
          status: 'ordered',
          orderDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          expectedDelivery: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
        },
        {
          pharmacyId,
          pharmacistId,
          supplierId: createdSuppliers[3]._id,
          poNumber: 'PO-2026-004',
          items: [
            { medicineId: createdMeds[7]._id, name: createdMeds[7].name, quantityOrdered: 50, unitCost: createdMeds[7].costPrice, subtotal: 50 * createdMeds[7].costPrice },
          ],
          totalAmount: 50 * createdMeds[7].costPrice,
          status: 'received',
          orderDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
          receivedDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        },
      ];

      await PurchaseOrder.insertMany(samplePOs);
      console.log(`✓ ${samplePOs.length} purchase orders created.`);
    }

    // 5. Sales Transactions
    const existingSalesCount = await Sale.countDocuments({ pharmacyId });
    if (existingSalesCount === 0) {
      const activeBatches = await StockBatch.find({ pharmacyId });
      const customers = [
        { name: 'Abebe Bikila', phone: '0911223344' },
        { name: 'Sara Tefera', phone: '0922334455' },
        { name: 'Daniel Gizaw', phone: '0933445566' },
        { name: 'Marta Worku', phone: '0944556677' },
        { name: 'Kassahun Desta', phone: '0955667788' },
        { name: 'Walk-in Customer', phone: '' },
      ];

      const salesData = [];
      for (let i = 0; i < 16; i++) {
        const cust = customers[i % customers.length];
        const med1 = createdMeds[i % createdMeds.length];
        const med2 = createdMeds[(i + 3) % createdMeds.length];
        const batch1 = activeBatches.find((b) => b.medicineId.toString() === med1._id.toString()) || activeBatches[0];
        const batch2 = activeBatches.find((b) => b.medicineId.toString() === med2._id.toString()) || activeBatches[1];

        const qty1 = (i % 3) + 1;
        const qty2 = (i % 2) + 1;
        const sub1 = qty1 * med1.price;
        const sub2 = qty2 * med2.price;
        const grandTotal = Number((sub1 + sub2).toFixed(2));

        // Spread dates across past 10 days
        const daysAgo = Math.floor(i / 2);
        const saleDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000 - (i % 8) * 3600 * 1000);

        salesData.push({
          pharmacyId,
          pharmacistId,
          invoiceNumber: `INV-${2026}${String(1001 + i).padStart(4, '0')}`,
          customer: cust,
          items: [
            { medicineId: med1._id, name: med1.name, batchId: batch1._id, batchNo: batch1.batchNo, quantity: qty1, unitPrice: med1.price, subtotal: sub1 },
            { medicineId: med2._id, name: med2.name, batchId: batch2._id, batchNo: batch2.batchNo, quantity: qty2, unitPrice: med2.price, subtotal: sub2 },
          ],
          subtotal: grandTotal,
          grandTotal,
          paymentMethod: ['cash', 'card', 'mobile_money'][i % 3],
          paymentStatus: 'paid',
          createdAt: saleDate,
          updatedAt: saleDate,
        });
      }

      await Sale.insertMany(salesData);
      console.log(`✓ ${salesData.length} sales transactions created across past 10 days.`);
    }

    console.log('--------------------------------------------------');
    console.log('✓ All pharmacy real operational data seeded successfully!');
    console.log('--------------------------------------------------');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
};

seedPharmacyData();
