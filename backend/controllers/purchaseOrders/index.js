// purchaseOrderController.js split into cohesive modules; this index keeps the original export surface.
const queries = require('./queries');
const create = require('./create');
const receive = require('./receive');
const status = require('./status');

module.exports = {
  getPurchaseOrders: queries.getPurchaseOrders,
  getPurchaseOrderById: queries.getPurchaseOrderById,
  createPurchaseOrder: create.createPurchaseOrder,
  receivePurchaseOrder: receive.receivePurchaseOrder,
  cancelPurchaseOrder: status.cancelPurchaseOrder,
  submitPurchaseOrder: status.submitPurchaseOrder,
  closePurchaseOrder: status.closePurchaseOrder,
  // Shared with reorderController
  buildPurchaseOrderItems: create.buildPurchaseOrderItems,
  insertPurchaseOrder: create.insertPurchaseOrder,
};
