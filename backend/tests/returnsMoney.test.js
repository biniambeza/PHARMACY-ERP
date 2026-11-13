// Money correctness of returns, voids and the reports built on them:
// per-line refunds (tax / discount / pack rounding), insurance claim adjustments after
// submission, VAT summary and period summary net of returns, fiscal void guard, store credit.
const mongoose = require('mongoose');
const {
  app, request, auth, uid, daysFromNow,
  connectTestDb, disconnectTestDb, createPharmacist, createMedicine, insertBatchRaw,
} = require('./helpers');

const Pharmacy = require('../models/Pharmacy');
const Sale = require('../models/Sale');
const Return = require('../models/Return');
const Customer = require('../models/Customer');
const CustomerLedger = require('../models/CustomerLedger');
const InsuranceClaim = require('../models/InsuranceClaim');
const FiscalInvoice = require('../models/FiscalInvoice');
const { buildCreditNotePayload, validatePayload } = require('../services/einvoice/payload');
const { getPeriodSummary, getReturnTotals } = require('../controllers/reports/aggregates');

const api = (t) => ({
  get: (u) => request(app).get(u).set(auth(t)),
  post: (u, b) => request(app).post(u).set(auth(t)).send(b),
  put: (u, b) => request(app).put(u).set(auth(t)).send(b),
});

beforeAll(async () => {
  await connectTestDb('returns_money');
});
afterAll(disconnectTestDb);

const setTax = (owner, tax) => Pharmacy.updateOne({ _id: owner.pharmacy._id }, { $set: { 'settings.tax': tax } });

const stocked = async (owner, overrides = {}, qty = 100) => {
  const med = await createMedicine(owner.pharmacy._id, overrides);
  const batch = await insertBatchRaw(owner.pharmacy._id, med._id, { quantity: qty, expiryDate: daysFromNow(200) });
  return { med, batch };
};

const sell = async (owner, body) => {
  const res = await api(owner.token).post('/api/sales', { paymentMethod: 'cash', ...body });
  expect(res.status).toBe(201);
  return res.body.sale;
};

const itemOf = (sale, med) => sale.items.find((i) => String(i.medicineId) === String(med._id));

const doReturn = (owner, sale, items, extra = {}) =>
  api(owner.token).post('/api/returns', { saleId: sale._id, reason: 'test', items, ...extra });

// ---------------------------------------------------------------------------
describe('per-line refunds', () => {
  let A;
  beforeAll(async () => {
    A = await createPharmacist();
  });
  afterEach(() => setTax(A, { enabled: false }));

  test('exclusive tax: exempt line refunds its price, taxed line its price + its own tax', async () => {
    await setTax(A, { enabled: true, rate: 15, inclusive: false });
    const taxed = await stocked(A, { price: 100 });
    const exempt = await stocked(A, { price: 100, taxExempt: true });
    const sale = await sell(A, { items: [{ medicineId: taxed.med._id, quantity: 1 }, { medicineId: exempt.med._id, quantity: 1 }] });
    expect(sale.grandTotal).toBe(215);

    const r1 = await doReturn(A, sale, [{ saleItemId: itemOf(sale, exempt.med)._id, quantity: 1 }]);
    expect(r1.status).toBe(201);
    expect(r1.body.return.refundTotal).toBe(100);
    expect(r1.body.return.items[0]).toMatchObject({ refundAmount: 100, grossAmount: 100, taxAmount: 0, netAmount: 100 });
    expect(r1.body.return).toMatchObject({ grossTotal: 100, taxTotal: 0, netTotal: 100, insurerTotal: 0 });

    const r2 = await doReturn(A, sale, [{ saleItemId: itemOf(sale, taxed.med)._id, quantity: 1 }]);
    expect(r2.status).toBe(201);
    expect(r2.body.return.refundTotal).toBe(115);
    expect(r2.body.return.items[0]).toMatchObject({ grossAmount: 115, taxAmount: 15, netAmount: 100 });
    expect(r2.body.sale.returnStatus).toBe('full');
  });

  test('inclusive tax: the taxed line refunds its shelf price and records the tax inside it', async () => {
    await setTax(A, { enabled: true, rate: 15, inclusive: true });
    const taxed = await stocked(A, { price: 115 });
    const exempt = await stocked(A, { price: 50, taxExempt: true });
    const sale = await sell(A, { items: [{ medicineId: taxed.med._id, quantity: 1 }, { medicineId: exempt.med._id, quantity: 1 }] });
    expect(sale.grandTotal).toBe(165);
    const r = await doReturn(A, sale, [{ saleItemId: itemOf(sale, taxed.med)._id, quantity: 1 }]);
    expect(r.body.return.refundTotal).toBe(115);
    expect(r.body.return.items[0]).toMatchObject({ taxAmount: 15, netAmount: 100 });
  });

  test('pack rounding never refunds more than the pack cost', async () => {
    const { med } = await stocked(A, { price: 3.67, packUnits: [{ name: 'box', factor: 3, price: 10.01 }] });
    const other = await stocked(A, { price: 5 });
    const sale = await sell(A, { items: [{ medicineId: med._id, quantity: 1, unitName: 'box' }, { medicineId: other.med._id, quantity: 1 }] });
    const it = itemOf(sale, med);
    expect(it.subtotal).toBe(10.01);

    const all = await doReturn(A, sale, [{ saleItemId: it._id, quantity: 3 }]);
    expect(all.body.return.refundTotal).toBe(10.01);

    // Same sale shape, returned one unit at a time: total still equals what was paid
    const sale2 = await sell(A, { items: [{ medicineId: med._id, quantity: 1, unitName: 'box' }, { medicineId: other.med._id, quantity: 1 }] });
    const it2 = itemOf(sale2, med);
    let total = 0;
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const r = await doReturn(A, sale2, [{ saleItemId: it2._id, quantity: 1 }]);
      expect(r.status).toBe(201);
      total += r.body.return.refundTotal;
    }
    expect(Math.round(total * 100) / 100).toBe(10.01);
  });

  test('sale discount is shared by line value; a full return refunds exactly the grand total', async () => {
    await setTax(A, { enabled: true, rate: 15, inclusive: false });
    const taxed = await stocked(A, { price: 30 });
    const exempt = await stocked(A, { price: 70, taxExempt: true });
    const sale = await sell(A, {
      discount: 10,
      items: [{ medicineId: taxed.med._id, quantity: 3 }, { medicineId: exempt.med._id, quantity: 1 }],
    });
    // subtotal 160, discount 10 -> taxed 90-5.63=84.37 (+12.66 tax), exempt 70-4.37=65.63
    const r1 = await doReturn(A, sale, [{ saleItemId: itemOf(sale, exempt.med)._id, quantity: 1 }]);
    expect(r1.body.return.items[0].taxAmount).toBe(0);
    expect(r1.body.return.items[0].discountAmount).toBeGreaterThan(0);
    const r2 = await doReturn(A, sale, [{ saleItemId: itemOf(sale, taxed.med)._id, quantity: 1 }]);
    const r3 = await doReturn(A, sale, [{ saleItemId: itemOf(sale, taxed.med)._id, quantity: 2 }]);
    const refunded = r1.body.return.refundTotal + r2.body.return.refundTotal + r3.body.return.refundTotal;
    expect(Math.round(refunded * 100) / 100).toBe(sale.grandTotal);
    const tax = r2.body.return.taxTotal + r3.body.return.taxTotal;
    expect(Math.round(tax * 100) / 100).toBe(sale.tax);
  });

  test('credit note payload uses the stored per-line amounts and equals the refund', async () => {
    await setTax(A, { enabled: true, rate: 15, inclusive: false });
    const taxed = await stocked(A, { price: 100 });
    const exempt = await stocked(A, { price: 100, taxExempt: true });
    const sale = await sell(A, { items: [{ medicineId: taxed.med._id, quantity: 1 }, { medicineId: exempt.med._id, quantity: 1 }] });
    const r = await doReturn(A, sale, [
      { saleItemId: itemOf(sale, exempt.med)._id, quantity: 1 },
      { saleItemId: itemOf(sale, taxed.med)._id, quantity: 1 },
    ]);
    const ret = await Return.findById(r.body.return._id).lean();
    const saleDoc = await Sale.findById(sale._id).lean();
    const pharmacy = { name: 'P', tin: '0012345678', settings: { tax: { rate: 15 } } };
    const payload = buildCreditNotePayload({ pharmacy, sale: saleDoc, ret });
    expect(validatePayload(payload)).toEqual([]);
    expect(payload.totals.grandTotal).toBe(ret.refundTotal);
    expect(payload.totals.taxTotal).toBe(15);
    expect(payload.insurerShare).toBe(0);
    const exemptLine = payload.lines.find((l) => l.taxRate === 0);
    expect(exemptLine.lineTotal).toBe(100);
  });
});

// ---------------------------------------------------------------------------
describe('insurance claims after submission', () => {
  let A;
  let scheme;
  let member;
  beforeAll(async () => {
    A = await createPharmacist();
    scheme = (await api(A.token).post('/api/insurance/schemes', {
      name: `S ${uid()}`, type: 'cbhi', coveragePercent: 80, copayType: 'none', copayValue: 0,
    })).body.scheme;
    member = (await api(A.token).post('/api/insurance/members', {
      schemeId: scheme._id, memberNo: `M-${uid()}`, name: 'Mem', validFrom: daysFromNow(-30), validTo: daysFromNow(300),
    })).body.member;
  });

  // Sells one item at 100 (insurer 80, patient 20) and puts it on a submitted claim.
  const insuredSaleOnSubmittedClaim = async () => {
    const { med } = await stocked(A, { price: 100 }, 10);
    const sale = await sell(A, {
      paymentMethod: undefined,
      items: [{ medicineId: med._id, quantity: 2 }],
      payments: [{ method: 'insurance', amount: 0, schemeId: scheme._id, memberId: member._id }, { method: 'cash', amount: 40 }],
    });
    const range = { from: daysFromNow(-1).toISOString(), to: daysFromNow(1).toISOString() };
    const claim = (await api(A.token).post('/api/insurance/claims', { schemeId: scheme._id, ...range })).body.claim;
    expect(claim.totalAmount).toBe(160);
    expect((await api(A.token).post(`/api/insurance/claims/${claim._id}/submit`)).status).toBe(200);
    return { sale, claim };
  };

  test('void is refused, a return books the insurer share as a claim adjustment', async () => {
    const { sale, claim } = await insuredSaleOnSubmittedClaim();

    const v = await api(A.token).post(`/api/returns/void/${sale._id}`, { reason: 'oops' });
    expect(v.status).toBe(400);
    expect(v.body.message).toMatch(/claim .* cannot be voided; use a return/i);

    const r = await doReturn(A, sale, [{ saleItemId: sale.items[0]._id, quantity: 1 }]);
    expect(r.status).toBe(201);
    expect(r.body.return.refundTotal).toBe(20);
    expect(r.body.return.insurerTotal).toBe(80);
    expect(r.body.return.claimAdjustment).toMatchObject({ amount: 80 });
    expect(r.body.claim).toMatchObject({ adjustedTotal: 80, outstanding: 80, refundDueToInsurer: 0 });

    const c = await InsuranceClaim.findById(claim._id).lean();
    expect(c.status).toBe('submitted');
    expect(c.totalAmount).toBe(160);
    expect(c.adjustments).toHaveLength(1);
    expect(c.adjustments[0]).toMatchObject({ amount: 80, returnNumber: r.body.return.returnNumber });
    expect(c.netAmount).toBe(80);
    expect(c.outstandingAmount).toBe(80);

    // The insurer can no longer be billed for the returned goods
    const over = await api(A.token).post(`/api/insurance/claims/${claim._id}/payments`, { amount: 160 });
    expect(over.status).toBe(400);
    const ok = await api(A.token).post(`/api/insurance/claims/${claim._id}/payments`, { amount: 80 });
    expect(ok.status).toBe(200);
    expect(ok.body.claim.status).toBe('paid');
  });

  test('return after the claim was paid shows the amount owed back to the insurer', async () => {
    const { sale, claim } = await insuredSaleOnSubmittedClaim();
    expect((await api(A.token).post(`/api/insurance/claims/${claim._id}/payments`, { amount: 160 })).status).toBe(200);

    const r = await doReturn(A, sale, [{ saleItemId: sale.items[0]._id, quantity: 2 }]);
    expect(r.status).toBe(201);
    expect(r.body.return.refundTotal).toBe(40);
    expect(r.body.claim).toMatchObject({ status: 'paid', outstanding: 0, refundDueToInsurer: 160 });

    const rec = await api(A.token).get('/api/insurance/receivables');
    expect(rec.status).toBe(200);
    expect(rec.body.totals.refundDueToInsurer).toBeGreaterThanOrEqual(160);

    // Reports: a fully returned insurance sale adds nothing (insurer share included)
    const from = new Date(Date.now() - 60 * 60 * 1000);
    const to = new Date(Date.now() + 60 * 60 * 1000);
    const totals = await getReturnTotals(A.pharmacy._id, from, to);
    expect(totals.insurerReturned).toBeGreaterThanOrEqual(160);
  });

  test('partially paid claim becomes paid when the rest is returned', async () => {
    const { sale, claim } = await insuredSaleOnSubmittedClaim();
    expect((await api(A.token).post(`/api/insurance/claims/${claim._id}/payments`, { amount: 80 })).status).toBe(200);
    const r = await doReturn(A, sale, [{ saleItemId: sale.items[0]._id, quantity: 1 }]);
    expect(r.body.claim).toMatchObject({ status: 'paid', outstanding: 0, refundDueToInsurer: 0 });
    const s = await Sale.findById(sale._id).lean();
    expect(s.payments.find((p) => p.method === 'insurance').status).toBe('completed');
  });
});

// ---------------------------------------------------------------------------
describe('reports net of returns', () => {
  test('VAT summary separates exempt sales and takes returned tax off by return date', async () => {
    const A = await createPharmacist();
    await setTax(A, { enabled: true, rate: 15, inclusive: false });
    const taxed = await stocked(A, { price: 100 });
    const exempt = await stocked(A, { price: 100, taxExempt: true });
    const sale = await sell(A, { items: [{ medicineId: taxed.med._id, quantity: 1 }, { medicineId: exempt.med._id, quantity: 1 }] });

    const before = (await api(A.token).get('/api/reports/tax-summary?range=today')).body.report.totals;
    expect(before).toMatchObject({ tax: 15, taxableSales: 100, exemptSales: 100, grossSales: 215 });

    await doReturn(A, sale, [{ saleItemId: itemOf(sale, taxed.med)._id, quantity: 1 }]);
    const after = (await api(A.token).get('/api/reports/tax-summary?range=today')).body.report;
    expect(after.totals).toMatchObject({
      tax: 0, taxableSales: 0, exemptSales: 100, grossSales: 100, salesTax: 15, returnedTax: 15,
    });
    expect(after.byRate[0].amount).toBe(0);
  });

  test('period summary and profit report are net of tax on both sides', async () => {
    const A = await createPharmacist();
    await setTax(A, { enabled: true, rate: 15, inclusive: false });
    const taxed = await stocked(A, { price: 100, costPrice: 60 });
    const sale = await sell(A, { items: [{ medicineId: taxed.med._id, quantity: 2 }] });
    expect(sale.grandTotal).toBe(230);
    await doReturn(A, sale, [{ saleItemId: sale.items[0]._id, quantity: 1 }]);

    const from = new Date(Date.now() - 60 * 60 * 1000);
    const to = new Date(Date.now() + 60 * 60 * 1000);
    const s = await getPeriodSummary(A.pharmacy._id, from, to);
    expect(s).toMatchObject({ grossSales: 230, refunds: 115, refundedTax: 15, refundsNet: 100, revenue: 115, tax: 15, netRevenue: 100 });

    const profit = (await api(A.token).get('/api/reports/profit?range=today')).body.report;
    expect(profit.totals.revenue).toBe(100);
  });

  test('older returns without per-item amounts fall back to proportional figures', async () => {
    const A = await createPharmacist();
    await setTax(A, { enabled: true, rate: 15, inclusive: false });
    const taxed = await stocked(A, { price: 100 });
    const sale = await sell(A, { items: [{ medicineId: taxed.med._id, quantity: 2 }] });
    const si = sale.items[0];
    await Return.collection.insertOne({
      pharmacyId: A.pharmacy._id,
      saleId: new mongoose.Types.ObjectId(String(sale._id)),
      returnNumber: `OLD-${uid()}`,
      items: [{
        saleItemId: new mongoose.Types.ObjectId(String(si._id)),
        medicineId: new mongoose.Types.ObjectId(String(si.medicineId)),
        name: si.name,
        batchId: new mongoose.Types.ObjectId(String(si.batchId)),
        quantity: 1,
        unitPrice: 100,
        refundAmount: 115,
        disposition: 'restock',
        restocked: true,
      }],
      reason: 'legacy',
      refundMethod: 'cash',
      refundTotal: 115,
      processedBy: A.user._id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const totals = await getReturnTotals(A.pharmacy._id, new Date(Date.now() - 3600e3), new Date(Date.now() + 3600e3));
    expect(totals).toMatchObject({ refunds: 115, returnedGross: 115, returnedTax: 15, returnedNet: 100 });

    // A new return of the remaining unit refunds exactly what is left of the line
    const r = await doReturn(A, sale, [{ saleItemId: si._id, quantity: 1 }]);
    expect(r.status).toBe(201);
    expect(r.body.return.refundTotal).toBe(115);
  });
});

// ---------------------------------------------------------------------------
describe('void and fiscal invoices', () => {
  let A;
  beforeAll(async () => {
    A = await createPharmacist();
    await Pharmacy.updateOne(
      { _id: A.pharmacy._id },
      { $set: { tin: '0012345678', einvoice: { enabled: true, provider: 'mock', mode: 'sandbox' } } }
    );
  });

  test('a sale accepted by the tax authority cannot be voided', async () => {
    const { med } = await stocked(A, { price: 10 });
    const sale = await sell(A, { items: [{ medicineId: med._id, quantity: 1 }] });
    const sub = await api(A.token).post(`/api/einvoice/submit/${sale._id}`);
    expect(sub.status).toBe(200);
    expect((await FiscalInvoice.findOne({ saleId: sale._id }).lean()).status).toBe('accepted');

    const v = await api(A.token).post(`/api/returns/void/${sale._id}`, { reason: 'oops' });
    expect(v.status).toBe(400);
    expect(v.body.message).toMatch(/use a return/i);
    expect((await Sale.findById(sale._id).lean()).voided).toBe(false);
  });

  test('a pending fiscal record is closed as not_required when the sale is voided', async () => {
    const { med } = await stocked(A, { price: 10 });
    const sale = await sell(A, { items: [{ medicineId: med._id, quantity: 1 }] });
    await FiscalInvoice.findOneAndUpdate(
      { pharmacyId: A.pharmacy._id, saleId: sale._id, type: 'invoice' },
      { $setOnInsert: { pharmacyId: A.pharmacy._id, saleId: sale._id, type: 'invoice', status: 'pending', provider: 'mock' } },
      { upsert: true }
    );
    const v = await api(A.token).post(`/api/returns/void/${sale._id}`, { reason: 'oops' });
    expect(v.status).toBe(200);
    const fi = await FiscalInvoice.findOne({ saleId: sale._id }).lean();
    expect(fi.status).toBe('not_required');
  });
});

// ---------------------------------------------------------------------------
describe('store credit refunds', () => {
  let A;
  beforeAll(async () => {
    A = await createPharmacist();
  });

  const createCustomer = async (body = {}) => {
    const res = await api(A.token).post('/api/customers', {
      name: `Cust ${uid()}`, phone: `09${Math.floor(Math.random() * 1e8)}`, creditLimit: 1000, ...body,
    });
    expect(res.status).toBe(201);
    return res.body.customer;
  };

  test('store credit needs a customer on the sale', async () => {
    const { med } = await stocked(A, { price: 10 });
    const sale = await sell(A, { items: [{ medicineId: med._id, quantity: 1 }] });
    const r = await doReturn(A, sale, [{ saleItemId: sale.items[0]._id, quantity: 1 }], { refundMethod: 'store_credit' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/customer/i);
    expect(await Return.countDocuments({ saleId: sale._id })).toBe(0);
  });

  test('settles open credit sales first, then leaves store credit that the next credit sale uses', async () => {
    const customer = await createCustomer();
    const { med } = await stocked(A, { price: 50 });

    // Owes 50 on a credit sale
    const owed = await sell(A, { paymentMethod: 'credit', customerId: customer._id, items: [{ medicineId: med._id, quantity: 1 }] });
    expect(owed.balanceDue).toBe(50);

    // Paid cash for 2 more, returns them for store credit (100)
    const cashSale = await sell(A, { customerId: customer._id, items: [{ medicineId: med._id, quantity: 2 }] });
    const r = await doReturn(A, cashSale, [{ saleItemId: cashSale.items[0]._id, quantity: 2 }], { refundMethod: 'store_credit' });
    expect(r.status).toBe(201);
    expect(r.body.return).toMatchObject({ refundTotal: 100, storeCredited: 100, refundDue: 100, refundMethod: 'store_credit' });

    const c1 = await Customer.findById(customer._id).lean();
    expect(c1.balance).toBe(-50); // 50 settled the open sale, 50 is store credit
    const owedAfter = await Sale.findById(owed._id).lean();
    expect(owedAfter.balanceDue).toBe(0);
    expect(owedAfter.paymentStatus).toBe('paid');
    const entry = await CustomerLedger.findOne({ customerId: customer._id, type: 'store_credit' }).lean();
    expect(entry).toMatchObject({ amount: -100, balanceAfter: -50, refModel: 'Return' });

    // Next credit sale is paid from the store credit (even with no credit limit room)
    await Customer.updateOne({ _id: customer._id }, { $set: { creditLimit: 0 } });
    const next = await api(A.token).post('/api/sales', {
      paymentMethod: 'credit', customerId: customer._id, items: [{ medicineId: med._id, quantity: 1 }],
    });
    expect(next.status).toBe(201);
    const nextSale = await Sale.findById(next.body.sale._id).lean();
    expect(nextSale.balanceDue).toBe(0);
    expect(nextSale.paymentStatus).toBe('paid');
    expect((await Customer.findById(customer._id).lean()).balance).toBe(0);

    // Statement running balance agrees with the customer balance
    const st = await api(A.token).get(`/api/customers/${customer._id}/statement`);
    expect(st.status).toBe(200);
    const lines = st.body.entries;
    expect(lines.map((l) => l.type)).toEqual(['sale', 'store_credit', 'sale']);
    expect(lines.some((l) => l.type === 'store_credit' && l.description === `Store credit from return ${r.body.return.returnNumber}`)).toBe(true);
    expect(lines[lines.length - 1].balance).toBe(0);
  });
});
