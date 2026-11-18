const Batch = require('../models/Batch');
const DailyRecord = require('../models/DailyRecord');
const EggProduction = require('../models/EggProduction');
const FeedProduct = require('../models/FeedProduct');
const Vaccination = require('../models/Vaccination');
const Sale = require('../models/Sale');
const Expense = require('../models/Expense');

const resolveDateRange = (range, customStart, customEnd) => {
  const end = customEnd ? new Date(customEnd) : new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  switch (range) {
    case 'today':
      break;
    case '7d':
      start.setDate(start.getDate() - 6);
      break;
    case '90d':
      start.setDate(start.getDate() - 89);
      break;
    case 'custom':
      return { start: customStart ? new Date(customStart) : start, end };
    case '30d':
    default:
      start.setDate(start.getDate() - 29);
      break;
  }
  return { start, end };
};

exports.getDashboardAnalytics = async (req, res, next) => {
  try {
    const { range = '30d', startDate, endDate } = req.query;
    const { start, end } = resolveDateRange(range, startDate, endDate);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      activeBatches,
      todayRecords,
      todayEggsAgg,
      salesAgg,
      expensesAgg,
      upcomingVaccinations,
      lowStockFeeds,
      recentActivities,
      recentTransactions,
      dailyTrendAgg,
      eggTrendAgg,
      salesTrendAgg,
      expenseTrendAgg,
    ] = await Promise.all([
      Batch.find({ farm: req.farmId, status: 'active' }),
      DailyRecord.find({ farm: req.farmId, recordDate: { $gte: todayStart } }),
      EggProduction.aggregate([
        { $match: { farm: req.farmId, productionDate: { $gte: todayStart } } },
        { $group: { _id: null, total: { $sum: '$totalCollected' } } },
      ]),
      Sale.aggregate([
        { $match: { farm: req.farmId, salesDate: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: null,
            totalBilledRevenue: { $sum: '$totalAmount' },
            cashCollected: { $sum: '$amountPaid' },
            outstandingReceivables: { $sum: '$balanceDue' },
          },
        },
      ]),
      Expense.aggregate([
        { $match: { farm: req.farmId, expenseDate: { $gte: start, $lte: end } } },
        { $group: { _id: null, totalExpenses: { $sum: '$amount' } } },
      ]),
      Vaccination.find({
        farm: req.farmId,
        status: { $in: ['scheduled', 'overdue'] },
        scheduledDate: { $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      })
        .populate('batch', 'batchName batchCode')
        .sort({ scheduledDate: 1 })
        .limit(6),
      FeedProduct.find({
        farm: req.farmId,
        $expr: { $lte: ['$currentStockKg', '$lowStockThresholdKg'] },
      }),
      DailyRecord.find({ farm: req.farmId })
        .populate('batch', 'batchName')
        .populate('recordedBy', 'fullName')
        .sort({ createdAt: -1 })
        .limit(8),
      Sale.find({ farm: req.farmId }).sort({ salesDate: -1 }).limit(6),
      // Time-series aggregations for Recharts
      DailyRecord.aggregate([
        { $match: { farm: req.farmId, recordDate: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$recordDate' } },
            feedKg: { $sum: '$feedQuantityKg' },
            waterLitres: { $sum: '$waterLitres' },
            mortality: { $sum: '$mortalityCount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      EggProduction.aggregate([
        { $match: { farm: req.farmId, productionDate: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$productionDate' } },
            eggs: { $sum: '$totalCollected' },
            avgHenDay: { $avg: '$henDayPercentage' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Sale.aggregate([
        { $match: { farm: req.farmId, salesDate: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$salesDate' } },
            revenue: { $sum: '$totalAmount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Expense.aggregate([
        { $match: { farm: req.farmId, expenseDate: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$expenseDate' } },
            expenses: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const totalBirds = activeBatches.reduce((sum, b) => sum + b.currentQuantity, 0);
    const todaysMortality = todayRecords
      .filter((r) => r.recordType === 'mortality')
      .reduce((sum, r) => sum + r.mortalityCount, 0);
    const todaysFeedKg = todayRecords
      .filter((r) => r.recordType === 'feeding')
      .reduce((sum, r) => sum + r.feedQuantityKg, 0);
    const todaysWaterLitres = todayRecords
      .filter((r) => r.recordType === 'water')
      .reduce((sum, r) => sum + r.waterLitres, 0);

    const totalRevenue = salesAgg[0]?.totalBilledRevenue || 0;
    const cashReceived = salesAgg[0]?.cashCollected || 0;
    const outstandingReceivables = salesAgg[0]?.outstandingReceivables || 0;
    const totalExpenses = expensesAgg[0]?.totalExpenses || 0;
    const netProfit = totalRevenue - totalExpenses;

    res.json({
      summary: {
        totalBirds,
        activeBatchesCount: activeBatches.length,
        todaysMortality,
        todaysFeedKg,
        todaysWaterLitres,
        todaysEggs: todayEggsAgg[0]?.total || 0,
        totalRevenue,
        cashReceived,
        outstandingReceivables,
        totalExpenses,
        netProfit,
        costPerBird: totalBirds > 0 ? Number((totalExpenses / totalBirds).toFixed(2)) : 0,
        upcomingVaccinationsCount: upcomingVaccinations.length,
      },
      charts: {
        dailyOperations: dailyTrendAgg,
        eggProduction: eggTrendAgg,
        salesTrend: salesTrendAgg,
        expenseTrend: expenseTrendAgg,
        batchComparison: activeBatches.map((b) => ({
          name: b.batchName,
          category: b.category,
          population: b.currentQuantity,
          mortality: b.totalMortality,
          survivalRate:
            b.initialQuantity > 0
              ? Number((((b.initialQuantity - b.totalMortality) / b.initialQuantity) * 100).toFixed(1))
              : 100,
        })),
      },
      widgets: {
        upcomingVaccinations,
        lowStockFeeds,
        recentActivities,
        recentTransactions,
      },
    });
  } catch (error) {
    next(error);
  }
};