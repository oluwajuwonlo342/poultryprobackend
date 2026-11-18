const mongoose = require('mongoose');
const Batch = require('../models/Batch');
const DailyRecord = require('../models/DailyRecord');
const FeedProduct = require('../models/FeedProduct');
const EggProduction = require('../models/EggProduction');
const Sale = require('../models/Sale');
const Expense = require('../models/Expense');
const Vaccination = require('../models/Vaccination');

const getDashboardAnalytics = async (req, res, next) => {
  try {
    // Always cast to ObjectId so MongoDB $match aggregations match properly
    const farmObjectId = new mongoose.Types.ObjectId(req.farm._id);
    const { range = '30d' } = req.query;

    const daysMap = { today: 1, '7d': 7, '30d': 30, '90d': 90 };
    const days = daysMap[range] || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const [
      activeBatches,
      feedProducts,
      periodRecords,
      salesAgg,
      expensesAgg,
      feedTrend,
      eggTrend,
      upcomingVaccinations,
    ] = await Promise.all([
      Batch.find({ farm: farmObjectId, status: 'active' }),
      FeedProduct.find({ farm: farmObjectId }),
      DailyRecord.find({ farm: farmObjectId, recordDate: { $gte: startDate } }),
      Sale.aggregate([
        { $match: { farm: farmObjectId, salesDate: { $gte: startDate } } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$totalAmount' },
            collectedRevenue: { $sum: '$amountPaid' },
          },
        },
      ]),
      Expense.aggregate([
        { $match: { farm: farmObjectId, expenseDate: { $gte: startDate } } },
        { $group: { _id: null, totalExpenses: { $sum: '$amount' } } },
      ]),
      DailyRecord.aggregate([
        {
          $match: {
            farm: farmObjectId,
            recordType: 'feeding',
            recordDate: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$recordDate' } },
            totalFeedKg: { $sum: '$feedQuantityKg' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      EggProduction.aggregate([
        { $match: { farm: farmObjectId, productionDate: { $gte: startDate } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$productionDate' } },
            goodEggs: { $sum: '$goodEggs' },
            crackedEggs: { $sum: '$crackedEggs' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Vaccination.find({
        farm: farmObjectId,
        status: 'scheduled',
        scheduledDate: { $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      })
        .populate('batch', 'batchName batchCode')
        .sort({ scheduledDate: 1 }),
    ]);

    const totalLiveBirds = activeBatches.reduce((sum, b) => sum + (b.currentQuantity || 0), 0);
    const totalInitialBirds = activeBatches.reduce((sum, b) => sum + (b.initialQuantity || 0), 0);

    const periodMortality = periodRecords
      .filter((r) => r.recordType === 'mortality')
      .reduce((sum, r) => sum + (r.mortalityCount || 0), 0);

    const periodFeedUsedKg = periodRecords
      .filter((r) => r.recordType === 'feeding')
      .reduce((sum, r) => sum + (r.feedQuantityKg || 0), 0);

    const totalFeedStockKg = feedProducts.reduce((sum, f) => sum + (f.currentStockKg || 0), 0);
    const lowStockFeeds = feedProducts.filter((f) => f.currentStockKg <= f.lowStockThresholdKg);

    const eggStockAvailable = req.farm.eggStockAvailable || 0;
    const cratesAvailable = Math.floor(eggStockAvailable / 30);

    const totalRevenue = salesAgg[0]?.totalRevenue || 0;
    const collectedRevenue = salesAgg[0]?.collectedRevenue || 0;
    const totalExpenses = expensesAgg[0]?.totalExpenses || 0;
    const netProfit = totalRevenue - totalExpenses;

    const mortalityRatePct =
      totalInitialBirds > 0 ? Number(((periodMortality / totalInitialBirds) * 100).toFixed(2)) : 0;

    res.json({
      kpis: {
        totalLiveBirds,
        activeBatchesCount: activeBatches.length,
        periodMortality,
        mortalityRatePct,
        totalFeedStockKg,
        periodFeedUsedKg,
        eggStockAvailable,
        cratesAvailable,
        totalRevenue,
        collectedRevenue,
        totalExpenses,
        netProfit,
      },
      charts: {
        feedTrend,
        eggTrend,
      },
      alerts: {
        lowStockFeeds,
        upcomingVaccinations,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getDashboardAnalytics };