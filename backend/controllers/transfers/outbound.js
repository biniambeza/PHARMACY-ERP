const Transfer = require('../../models/Transfer');
const Medicine = require('../../models/Medicine');
const StockBatch = require('../../models/StockBatch');
const AppError = require('../../utils/AppError');
const { recordMovement } = require('../../utils/stockMovement');
const { nextSequence, formatSequence } = require('../../utils/sequence');
const { audit } = require('../../utils/audit');
const { isId, parseLines, resolveDestination, allocateAndDeduct, runTransaction } = require('./helpers');

// @desc    Create a transfer from the current branch. Sent immediately unless
//          `draft: true` (stock is deducted only when sent).
// @route   POST /api/transfers  { toPharmacyId, lines: [{ medicineId, batchId?, quantity }], notes?, draft? }
// @access  transfer:manage (in the source branch)
const createTransfer = async (req, res) => {
  const { toPharmacyId, notes, draft } = req.body || {};
  const requested = parseLines(req.body && req.body.lines);
  const source = req.pharmacy;
  const dest = await resolveDestination(source, toPharmacyId);
  const asDraft = draft === true;

  const transfer = await runTransaction(async (session) => {
    const seq = await nextSequence(source._id, 'TRF', { session });
    const doc = new Transfer({
      organizationId: source.organizationId,
      number: formatSequence('TRF', seq),
      fromPharmacyId: source._id,
      toPharmacyId: dest._id,
      status: asDraft ? 'draft' : 'in_transit',
      createdBy: req.user._id,
      notes: typeof notes === 'string' ? notes.trim().slice(0, 1000) : '',
      lines: [],
    });

    if (asDraft) {
      const meds = await Medicine.find({
        _id: { $in: requested.map((l) => l.medicineId) },
        pharmacyId: source._id,
      })
        .select('name')
        .session(session);
      const byId = new Map(meds.map((m) => [String(m._id), m]));
      doc.lines = requested.map((l) => {
        const m = byId.get(l.medicineId);
        if (!m) throw new AppError('Medicine not found in this branch', 404);
        return { medicineId: m._id, medicineName: m.name, batchId: l.batchId, quantity: l.quantity };
      });
    } else {
      doc.lines = await allocateAndDeduct({
        transfer: doc,
        requested,
        pharmacyId: source._id,
        userId: req.user._id,
        session,
      });
      doc.sentAt = new Date();
    }
    await doc.save({ session });
    await audit(
      req,
      {
        action: asDraft ? 'transfer.create' : 'transfer.send',
        entity: 'Transfer',
        entityId: doc._id,
        after: doc,
        meta: { number: doc.number, toPharmacyId: dest._id },
      },
      { session }
    );
    return doc;
  });

  return res.status(201).json({
    success: true,
    message: asDraft ? 'Transfer saved as draft' : 'Transfer sent',
    transfer,
  });
};

// @desc    Send a draft transfer (deducts stock at the source)
// @route   POST /api/transfers/:id/send
// @access  transfer:manage (in the source branch)
const sendTransfer = async (req, res) => {
  if (!isId(req.params.id)) throw new AppError('Invalid id', 400);
  const source = req.pharmacy;

  const transfer = await runTransaction(async (session) => {
    // Atomic claim draft -> in_transit
    const doc = await Transfer.findOneAndUpdate(
      { _id: req.params.id, fromPharmacyId: source._id, status: 'draft' },
      { $set: { status: 'in_transit', sentAt: new Date() } },
      { returnDocument: 'after', session }
    );
    if (!doc) {
      const exists = await Transfer.exists({ _id: req.params.id, fromPharmacyId: source._id }).session(session);
      throw new AppError(exists ? 'Only draft transfers can be sent' : 'Transfer not found', exists ? 409 : 404);
    }
    await resolveDestination(source, doc.toPharmacyId, { session });
    const requested = doc.lines.map((l) => ({
      medicineId: String(l.medicineId),
      batchId: l.batchId ? String(l.batchId) : null,
      quantity: l.quantity,
    }));
    doc.lines = await allocateAndDeduct({
      transfer: doc,
      requested,
      pharmacyId: source._id,
      userId: req.user._id,
      session,
    });
    await doc.save({ session });
    await audit(
      req,
      { action: 'transfer.send', entity: 'Transfer', entityId: doc._id, after: doc, meta: { number: doc.number } },
      { session }
    );
    return doc;
  });

  return res.status(200).json({ success: true, message: 'Transfer sent', transfer });
};

// @desc    Cancel a draft or in-transit transfer. In-transit stock goes back to
//          the source batches. Allowed from the source or the destination branch
//          (destination = reject); drafts only from the source.
// @route   POST /api/transfers/:id/cancel  { reason? }
// @access  transfer:manage
const cancelTransfer = async (req, res) => {
  if (!isId(req.params.id)) throw new AppError('Invalid id', 400);
  const pid = req.pharmacyId;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) : '';

  const transfer = await runTransaction(async (session) => {
    const doc = await Transfer.findOneAndUpdate(
      {
        _id: req.params.id,
        $or: [
          { fromPharmacyId: pid, status: { $in: ['draft', 'in_transit'] } },
          { toPharmacyId: pid, status: 'in_transit' },
        ],
      },
      { $set: { status: 'cancelled', cancelledBy: req.user._id, cancelledAt: new Date() } },
      { returnDocument: 'before', session }
    );
    if (!doc) {
      const existing = await Transfer.findOne({
        _id: req.params.id,
        $or: [{ fromPharmacyId: pid }, { toPharmacyId: pid, status: { $ne: 'draft' } }],
      })
        .select('status')
        .session(session);
      if (!existing) throw new AppError('Transfer not found', 404);
      throw new AppError(`Transfer is already ${existing.status.replace('_', ' ')}`, 409);
    }

    const wasInTransit = doc.status === 'in_transit';
    if (wasInTransit) {
      for (const line of doc.lines) {
        let batch = line.batchId
          ? await StockBatch.findOneAndUpdate(
              { _id: line.batchId, pharmacyId: doc.fromPharmacyId },
              { $inc: { quantity: line.quantity } },
              { returnDocument: 'after', session }
            )
          : null;
        if (batch && batch.status === 'depleted' && batch.quantity > 0) {
          await StockBatch.updateOne({ _id: batch._id }, { $set: { status: 'active' } }, { session });
        }
        if (!batch) {
          // Source batch was removed meanwhile: recreate it
          [batch] = await StockBatch.create(
            [
              {
                pharmacyId: doc.fromPharmacyId,
                medicineId: line.medicineId,
                batchNo: `${line.batchNo || 'TRF'}-${doc.number}`,
                quantity: line.quantity,
                initialQuantity: line.quantity,
                expiryDate: line.expiryDate || new Date(),
                purchasePrice: line.unitCost || 0,
              },
            ],
            { session }
          );
        }
        await recordMovement(
          {
            pharmacyId: doc.fromPharmacyId,
            batchId: batch._id,
            medicineId: line.medicineId,
            type: 'transfer_in',
            quantityChange: line.quantity,
            balanceAfter: batch.quantity,
            reason: `Transfer ${doc.number} cancelled, stock returned${reason ? `: ${reason}` : ''}`,
            userId: req.user._id,
            refId: doc._id,
            refModel: 'Transfer',
          },
          { session }
        );
      }
    }
    if (reason) {
      await Transfer.updateOne(
        { _id: doc._id },
        { $set: { notes: `${doc.notes ? `${doc.notes}\n` : ''}Cancelled: ${reason}`.slice(0, 1000) } },
        { session }
      );
    }
    await audit(
      req,
      {
        action: 'transfer.cancel',
        entity: 'Transfer',
        entityId: doc._id,
        before: doc,
        meta: { number: doc.number, stockReturned: wasInTransit, reason },
      },
      { session }
    );
    return Transfer.findById(doc._id).session(session);
  });

  return res.status(200).json({ success: true, message: 'Transfer cancelled', transfer });
};

module.exports = {
  createTransfer,
  sendTransfer,
  cancelTransfer,
};
