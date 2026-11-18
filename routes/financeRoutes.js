const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorizeFarmAccess } = require('../middleware/farmAccessMiddleware');
const { requirePlanFeature } = require('../middleware/subscriptionMiddleware');
const Expense = require('../models/Expense');
const Sale = require('../models/Sale');

// Require authenticated user, financial permission, and Starter+ subscription plan
router.use(protect, authorizeFarmAccess('viewFinancials'), requirePlanFeature('hasFinancialTracking'));

// List all expenses for the active farm
router.get('/expenses', async (req, res, next) => {
  try {
    const { category, batchId } = req.query;
    const filter = { farm: req.farmId };
    if (category) filter.category = category;
    if (batchId) filter.batch = batchId;

    const expenses = await Expense.find(filter)
      .populate('batch', 'batchName batchCode')
      .populate('recordedBy', 'fullName')
      .sort({ expenseDate: -1 });

    res.json(expenses);
  } catch (err) {
    next(err);
  }
});

// Record a new farm expense
router.post('/expenses', async (req, res, next) => {
  try {
    const { title, category, amount, expenseDate, paymentMethod, batchId, notes } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: 'Expense amount must be greater than zero.' });
    }

    const expense = await Expense.create({
      farm: req.farmId,
      batch: batchId || undefined,
      title,
      category,
      amount: Number(amount),
      expenseDate: expenseDate || new Date(),
      paymentMethod: paymentMethod || 'Cash',
      notes,
      recordedBy: req.user._id,
    });

    res.status(201).json(expense);
  } catch (err) {
    next(err);
  }
});

// Delete an expense entry
router.delete('/expenses/:expenseId', async (req, res, next) => {
  try {
    const deleted = await Expense.findOneAndDelete({ _id: req.params.expenseId, farm: req.farmId });
    if (!deleted) return res.status(404).json({ message: 'Expense record not found.' });
    res.json({ message: 'Expense deleted.' });
  } catch (err) {
    next(err);
  }
});

// Get Profit & Loss financial summary
router.get('/summary', async (req, res, next) => {
  try {
    const [sales, expenses] = await Promise.all([
      Sale.find({ farm: req.farmId }),
      Expense.find({ farm: req.farmId }),
    ]);

    const totalRevenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);
    const totalCollected = sales.reduce((sum, s) => sum + s.amountPaid, 0);
    const totalReceivables = sales.reduce((sum, s) => sum + s.balanceDue, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    const expensesByCategory = expenses.reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    }, {});

    res.json({
      totalRevenue,
      totalCollected,
      totalReceivables,
      totalExpenses,
      netProfit: totalRevenue - totalExpenses,
      expensesByCategory,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;