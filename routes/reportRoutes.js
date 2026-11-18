const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorizeFarmAccess } = require('../middleware/farmAccessMiddleware');
const { exportAsCSV, exportAsExcel, exportAsPDF } = require('../utils/reportGenerator');
const Batch = require('../models/Batch');
const Sale = require('../models/Sale');
const Expense = require('../models/Expense');
const DailyRecord = require('../models/DailyRecord');

router.get('/export', protect, authorizeFarmAccess('viewFinancials'), async (req, res, next) => {
  try {
    const { type = 'batch_performance', format = 'pdf' } = req.query;
    let columns = [];
    let rows = [];
    let title = 'Farm Report';

    if (type === 'sales') {
      title = 'Sales Report';
      columns = [
        { header: 'Receipt #', key: 'receiptNumber' },
        { header: 'Date', key: 'date' },
        { header: 'Customer', key: 'customerName' },
        { header: 'Category', key: 'productCategory' },
        { header: 'Total (NGN)', key: 'totalAmount' },
        { header: 'Status', key: 'paymentStatus' },
      ];
      const sales = await Sale.find({ farm: req.farmId }).sort({ salesDate: -1 });
      rows = sales.map((s) => ({
        receiptNumber: s.receiptNumber,
        date: new Date(s.salesDate).toLocaleDateString(),
        customerName: s.customerName,
        productCategory: s.productCategory,
        totalAmount: s.totalAmount.toLocaleString(),
        paymentStatus: s.paymentStatus.toUpperCase(),
      }));
    } else if (type === 'expenses') {
      title = 'Expense Report';
      columns = [
        { header: 'Date', key: 'date' },
        { header: 'Title', key: 'title' },
        { header: 'Category', key: 'category' },
        { header: 'Amount (NGN)', key: 'amount' },
      ];
      const expenses = await Expense.find({ farm: req.farmId }).sort({ expenseDate: -1 });
      rows = expenses.map((e) => ({
        date: new Date(e.expenseDate).toLocaleDateString(),
        title: e.title,
        category: e.category,
        amount: e.amount.toLocaleString(),
      }));
    } else {
      title = 'Batch Performance Report';
      columns = [
        { header: 'Batch Code', key: 'batchCode' },
        { header: 'Name', key: 'batchName' },
        { header: 'Category', key: 'category' },
        { header: 'Initial', key: 'initialQuantity' },
        { header: 'Current', key: 'currentQuantity' },
        { header: 'Mortality', key: 'totalMortality' },
      ];
      const batches = await Batch.find({ farm: req.farmId });
      rows = batches.map((b) => b.toObject());
    }

    const filename = `poultrypro_${type}_${Date.now()}`;
    if (format === 'csv') return exportAsCSV(res, filename, columns, rows);
    if (format === 'xlsx') return exportAsExcel(res, filename, title, columns, rows);
    return exportAsPDF(res, filename, title, req.farm.name, columns, rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;