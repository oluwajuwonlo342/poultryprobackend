const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorizeFarmAccess } = require('../middleware/farmAccessMiddleware');
const { getDashboardAnalytics } = require('../controllers/financeDashboardController');
const Expense = require('../models/Expense');

// Dashboard analytics (accessible to owners and workers; sensitive numbers filtered on UI for workers)
router.get('/dashboard', protect, authorizeFarmAccess(), getDashboardAnalytics);

// Expenses CRUD (requires viewFinancials permission)
router.get('/expenses', protect, authorizeFarmAccess('viewFinancials'), async (req, res, next) => {
  try {
    const expenses = await Expense.find({ farm: req.farmId })
      .populate('batch', 'batchName')
      .sort({ expenseDate: -1 });
    res.json(expenses);
  } catch (err) {
    next(err);
  }
});

router.post('/expenses', protect, authorizeFarmAccess('viewFinancials'), async (req, res, next) => {
  try {
    const expense = await Expense.create({
      ...req.body,
      farm: req.farmId,
      recordedBy: req.user._id,
    });
    res.status(201).json(expense);
  } catch (err) {
    next(err);
  }
});

module.exports = router;