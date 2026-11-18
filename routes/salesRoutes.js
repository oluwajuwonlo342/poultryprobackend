const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorizeFarmAccess } = require('../middleware/farmAccessMiddleware');
const { createSale, recordBalancePayment } = require('../controllers/eggSalesController');
const Sale = require('../models/Sale');

router.use(protect, authorizeFarmAccess('manageSales'));

router.post('/', createSale);
router.get('/', async (req, res, next) => {
  try {
    const sales = await Sale.find({ farm: req.farmId })
      .populate('batch', 'batchName batchCode')
      .sort({ salesDate: -1 });
    res.json(sales);
  } catch (err) {
    next(err);
  }
});
router.patch('/:id/pay-balance', recordBalancePayment);

module.exports = router;