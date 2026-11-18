const DailyRecord = require('../models/DailyRecord');
const Batch = require('../models/Batch');
const FeedProduct = require('../models/FeedProduct');
const FeedTransaction = require('../models/FeedTransaction');
const Notification = require('../models/Notification');

exports.createDailyRecord = async (req, res, next) => {
  try {
    const {
      batchId,
      recordDate,
      recordType,
      feedProductId,
      feedQuantityKg,
      waterLitres,
      mortalityCount,
      suspectedCause,
      description,
    } = req.body;

    const batch = await Batch.findOne({ _id: batchId, farm: req.farmId });
    if (!batch) return res.status(404).json({ message: 'Target bird batch not found.' });

    let feedProduct = null;
    let feedCostSnapshot = 0;

    // 1. Validate & deduct feed inventory if recordType === 'feeding'
    if (recordType === 'feeding') {
      const qty = Number(feedQuantityKg);
      if (qty <= 0) return res.status(400).json({ message: 'Feed quantity must be greater than 0 kg.' });

      if (feedProductId) {
        feedProduct = await FeedProduct.findOne({ _id: feedProductId, farm: req.farmId });
        if (!feedProduct) return res.status(404).json({ message: 'Selected feed product not found.' });

        if (feedProduct.currentStockKg < qty) {
          return res.status(400).json({
            message: `Insufficient feed stock. Available: ${feedProduct.currentStockKg} kg, Requested: ${qty} kg.`,
          });
        }

        feedProduct.currentStockKg -= qty;
        await feedProduct.save();
        feedCostSnapshot = Number((qty * feedProduct.weightedAvgCostPerKg).toFixed(2));

        await FeedTransaction.create({
          farm: req.farmId,
          feedProduct: feedProduct._id,
          batch: batch._id,
          transactionType: 'consumption',
          quantityKg: -qty,
          unitCostPerKg: feedProduct.weightedAvgCostPerKg,
          totalCost: feedCostSnapshot,
          transactionDate: recordDate || new Date(),
          notes: `Daily feeding for ${batch.batchName}`,
          recordedBy: req.user._id,
        });

        // Low stock alert trigger
        if (feedProduct.currentStockKg <= feedProduct.lowStockThresholdKg) {
          await Notification.create({
            user: req.farm.owner,
            farm: req.farmId,
            type: 'low_feed_stock',
            title: `Low Feed Stock: ${feedProduct.productName}`,
            message: `Only ${feedProduct.currentStockKg} kg remaining (Threshold: ${feedProduct.lowStockThresholdKg} kg).`,
            actionLink: '/dashboard/feed',
          });
        }
      }
    }

    // 2. Validate & deduct bird population if recordType === 'mortality'
    if (recordType === 'mortality') {
      const dead = Number(mortalityCount);
      if (dead <= 0) return res.status(400).json({ message: 'Mortality count must be at least 1 bird.' });
      if (dead > batch.currentQuantity) {
        return res.status(400).json({
          message: `Mortality (${dead}) cannot exceed current batch population (${batch.currentQuantity}).`,
        });
      }

      batch.currentQuantity -= dead;
      batch.totalMortality += dead;
      batch.populationHistory.push({
        date: recordDate || new Date(),
        type: 'mortality',
        quantityChange: -dead,
        balanceAfter: batch.currentQuantity,
        reason: suspectedCause || 'Daily mortality recorded',
        recordedBy: req.user._id,
      });
      await batch.save();

      // Unusual single-day mortality spike alert (> 1.5% of flock in one entry)
      const spikePercent = (dead / (batch.currentQuantity + dead)) * 100;
      if (spikePercent >= 1.5) {
        await Notification.create({
          user: req.farm.owner,
          farm: req.farmId,
          type: 'unusual_mortality',
          title: `Unusual Mortality Alert — ${batch.batchName}`,
          message: `${dead} birds (${spikePercent.toFixed(1)}%) lost in ${batch.batchName}. Suspected cause: ${suspectedCause || 'Unspecified'}.`,
          actionLink: `/dashboard/batches/${batch._id}`,
        });
      }
    }

    const record = await DailyRecord.create({
      farm: req.farmId,
      batch: batch._id,
      recordDate: recordDate || new Date(),
      recordType,
      feedProduct: feedProduct?._id,
      feedType: feedProduct?.productName || req.body.feedType,
      feedCategory: feedProduct?.feedType || req.body.feedCategory,
      feedQuantityKg: recordType === 'feeding' ? Number(feedQuantityKg) : 0,
      feedCostSnapshot,
      waterLitres: recordType === 'water' ? Number(waterLitres) : 0,
      mortalityCount: recordType === 'mortality' ? Number(mortalityCount) : 0,
      suspectedCause,
      description,
      recordedBy: req.user._id,
    });

    res.status(201).json(record);
  } catch (error) {
    next(error);
  }
};

exports.getDailyRecords = async (req, res, next) => {
  try {
    const { batchId, recordType, startDate, endDate } = req.query;
    const filter = { farm: req.farmId };

    if (batchId) filter.batch = batchId;
    if (recordType) filter.recordType = recordType;
    if (startDate || endDate) {
      filter.recordDate = {};
      if (startDate) filter.recordDate.$gte = new Date(startDate);
      if (endDate) filter.recordDate.$lte = new Date(endDate);
    }

    const records = await DailyRecord.find(filter)
      .populate('batch', 'batchName batchCode category')
      .populate('recordedBy', 'fullName role')
      .sort({ recordDate: -1, createdAt: -1 });

    res.json(records);
  } catch (error) {
    next(error);
  }
};