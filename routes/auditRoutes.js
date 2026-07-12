const express = require('express');
const AuditLog = require('../models/AuditLog');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, requireRole('admin'));

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.entityType) filter.entityType = String(req.query.entityType).trim();
    if (req.query.action) filter.action = String(req.query.action).trim();
    const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Unable to load audit logs', error: error.message });
  }
});

module.exports = router;
