// server/routes/billingRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  initializePaystackCheckout,
  verifyPaystackTransaction,
  handlePaystackWebhook,
} = require('../controllers/billingController');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const Payment = require('../models/Payment');

// Public webhook (raw body verified by HMAC signature inside controller)
router.post('/webhook', handlePaystackWebhook);

router.get('/plans', async (req, res, next) => {
  try {
    const plans = await SubscriptionPlan.find({ isActive: true }).sort({ monthlyPriceNGN: 1 });
    res.json(plans);
  } catch (err) {
    next(err);
  }
});

router.post('/initialize', protect, initializePaystackCheckout);
router.get('/verify/:reference', protect, verifyPaystackTransaction);
router.get('/history', protect, async (req, res, next) => {
  try {
    const payments = await Payment.find({ user: req.user._id })
      .populate('plan', 'name code')
      .sort({ createdAt: -1 });
    res.json(payments);
  } catch (err) {
    next(err);
  }
});

module.exports = router;