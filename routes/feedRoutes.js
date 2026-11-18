const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorizeFarmAccess } = require('../middleware/farmAccessMiddleware');
const {
  createFeedProduct,
  recordFeedPurchase,
  recordStockAdjustment,
} = require('../controllers/feedController');
const FeedProduct = require('../models/FeedProduct');
const FeedTransaction = require('../models/FeedTransaction');

router.use(protect, authorizeFarmAccess('manageInventory'));

router.get('/', async (req, res, next) => {
  try {
    const products = await FeedProduct.find({ farm: req.farmId }).sort({ productName: 1 });
    res.json(products);
  } catch (err) {
    next(err);
  }
});

router.get('/transactions', async (req, res, next) => {
  try {
    const txs = await FeedTransaction.find({ farm: req.farmId })
      .populate('feedProduct', 'productName feedType')
      .populate('batch', 'batchName')
      .populate('recordedBy', 'fullName')
      .sort({ transactionDate: -1 });
    res.json(txs);
  } catch (err) {
    next(err);
  }
});

router.post('/', createFeedProduct);
router.post('/purchase', recordFeedPurchase);
router.post('/adjust', recordStockAdjustment);

module.exports = router;