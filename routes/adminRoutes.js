// server/routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/authMiddleware');
const {
  getPlatformOverview,
  toggleUserAccountStatus,
  updateSubscriptionPlan,
} = require('../controllers/adminController');
const User = require('../models/User');
const Farm = require('../models/Farm');
const Payment = require('../models/Payment');
const SupportTicket = require('../models/SupportTicket');
const ActivityLog = require('../models/ActivityLog');

router.use(protect, requireRole('super_admin'));

router.get('/overview', getPlatformOverview);

router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    next(err);
  }
});
router.patch('/users/:userId/status', toggleUserAccountStatus);

router.get('/farms', async (req, res, next) => {
  try {
    const farms = await Farm.find().populate('owner', 'fullName email').sort({ createdAt: -1 });
    res.json(farms);
  } catch (err) {
    next(err);
  }
});

router.put('/plans/:planId', updateSubscriptionPlan);

router.get('/transactions', async (req, res, next) => {
  try {
    const payments = await Payment.find()
      .populate('user', 'fullName email')
      .populate('plan', 'name')
      .sort({ createdAt: -1 });
    res.json(payments);
  } catch (err) {
    next(err);
  }
});

router.get('/tickets', async (req, res, next) => {
  try {
    const tickets = await SupportTicket.find().populate('user', 'fullName email').sort({ createdAt: -1 });
    res.json(tickets);
  } catch (err) {
    next(err);
  }
});

router.get('/logs', async (req, res, next) => {
  try {
    const logs = await ActivityLog.find().populate('user', 'fullName email').sort({ createdAt: -1 }).limit(100);
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

module.exports = router;