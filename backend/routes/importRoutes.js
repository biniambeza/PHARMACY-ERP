// Mounted at /api/import: data import (#28). Owner: Catalog agent.
// Scaffolded by Foundation: every route is authenticated and tenant-scoped
// (req.pharmacyId, req.membershipRole). Gate each route with
// requirePermission('module:action') from middleware/permission.js.
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');
// eslint-disable-next-line no-unused-vars
const { requirePermission } = require('../middleware/permission');

router.use(protect, pharmacyScope);

module.exports = router;
