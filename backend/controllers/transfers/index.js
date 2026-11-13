// transferController.js split into cohesive modules; this index keeps the original export surface.
const queries = require('./queries');
const outbound = require('./outbound');
const receive = require('./receive');

module.exports = {
  getDestinations: queries.getDestinations,
  listTransfers: queries.listTransfers,
  getTransfer: queries.getTransfer,
  createTransfer: outbound.createTransfer,
  sendTransfer: outbound.sendTransfer,
  receiveTransfer: receive.receiveTransfer,
  cancelTransfer: outbound.cancelTransfer,
  getConsolidated: queries.getConsolidated,
};
