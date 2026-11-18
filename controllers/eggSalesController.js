const crypto = require('crypto');
const EggProduction = require('../models/EggProduction');
const Batch = require('../models/Batch');
const Farm = require('../models/Farm');
const Sale = require('../models/Sale');
const { calculateLayerMetrics } = require('../utils/calculations');

exports.recordEggProduction = async (req, res, next) => {
  try {
    const {
      batchId,
      productionDate,
      totalCollected,
      goodEggs,
      crackedEggs = 0,
      brokenEggs = 0,
      rejectedEggs = 0,
      otherLosses = 0,
      notes,
    } = req.body;

    const batch = await Batch.findOne({ _id: batchId, farm: req.farmId });
    if (!batch) return res.status(404).json({ message: 'Layer batch not found.' });

    const total = Number(totalCollected);
    const good = Number(goodEggs);
    const losses = Number(crackedEggs) + Number(brokenEggs) + Number(rejectedEggs) + Number(otherLosses);

    if (good + losses !== total) {
      return res.status(400).json({
        message: `Good eggs (${good}) plus losses (${losses}) must equal total collected (${total}).`,
      });
    }

    const { henDayPercent } = calculateLayerMetrics({
      eggsProducedToday: total,
      liveHenCount: batch.currentQuantity,
      totalFeedKg: 0,
      totalEggsPeriod: total,
    });

    const record = await EggProduction.create({
      farm: req.farmId,
      batch: batch._id,
      productionDate: productionDate || new Date(),
      totalCollected: total,
      goodEggs: good,
      crackedEggs: Number(crackedEggs),
      brokenEggs: Number(brokenEggs),
      rejectedEggs: Number(rejectedEggs),
      otherLosses: Number(otherLosses),
      liveHenCountSnapshot: batch.currentQuantity,
      henDayPercentage: henDayPercent,
      notes,
      recordedBy: req.user._id,
    });

    // Credit only saleable good eggs into farm egg inventory
    await Farm.findByIdAndUpdate(req.farmId, { $inc: { eggStockAvailable: good } });

    res.status(201).json(record);
  } catch (error) {
    next(error);
  }
};

exports.getEggProduction = async (req, res, next) => {
  try {
    const { batchId, startDate, endDate } = req.query;
    const filter = { farm: req.farmId };
    if (batchId) filter.batch = batchId;
    if (startDate || endDate) {
      filter.productionDate = {};
      if (startDate) filter.productionDate.$gte = new Date(startDate);
      if (endDate) filter.productionDate.$lte = new Date(endDate);
    }

    const [records, farm] = await Promise.all([
      EggProduction.find(filter)
        .populate('batch', 'batchName batchCode currentQuantity')
        .populate('recordedBy', 'fullName')
        .sort({ productionDate: -1 }),
      Farm.findById(req.farmId).select('eggStockAvailable'),
    ]);

    res.json({
      eggStockAvailable: farm?.eggStockAvailable || 0,
      cratesAvailable: Math.floor((farm?.eggStockAvailable || 0) / 30),
      records,
    });
  } catch (error) {
    next(error);
  }
};

exports.createSale = async (req, res, next) => {
  try {
    const {
      batchId,
      productCategory,
      productDescription,
      customerName,
      customerPhone,
      quantity,
      unitLabel,
      unitPrice,
      amountPaid,
      paymentMethod,
      salesDate,
      notes,
    } = req.body;

    const qty = Number(quantity);
    const price = Number(unitPrice);
    const totalAmount = Number((qty * price).toFixed(2));
    const paid = amountPaid !== undefined ? Number(amountPaid) : totalAmount;

    if (paid > totalAmount) {
      return res.status(400).json({ message: 'Amount paid cannot exceed total sale amount.' });
    }

    // 1. Validate Egg Inventory if selling Eggs (1 crate = 30 eggs if unitLabel === 'crates')
    if (productCategory === 'Eggs') {
      const eggsToDeduct = unitLabel === 'crates' ? qty * 30 : qty;
      const farm = await Farm.findById(req.farmId);
      if (farm.eggStockAvailable < eggsToDeduct) {
        return res.status(400).json({
          message: `Insufficient egg stock. Available: ${farm.eggStockAvailable} eggs (${Math.floor(
            farm.eggStockAvailable / 30
          )} crates).`,
        });
      }
      farm.eggStockAvailable -= eggsToDeduct;
      await farm.save();
    }

    // 2. Validate Live Bird population if selling Live Birds
    if (productCategory === 'Live Birds') {
      if (!batchId) {
        return res.status(400).json({ message: 'Batch selection is required when selling live birds.' });
      }
      const batch = await Batch.findOne({ _id: batchId, farm: req.farmId });
      if (!batch) return res.status(404).json({ message: 'Selected bird batch not found.' });
      if (batch.currentQuantity < qty) {
        return res.status(400).json({
          message: `Insufficient birds in batch. Available: ${batch.currentQuantity}, Requested: ${qty}.`,
        });
      }

      batch.currentQuantity -= qty;
      batch.totalSold += qty;
      batch.populationHistory.push({
        date: salesDate || new Date(),
        type: 'sale',
        quantityChange: -qty,
        balanceAfter: batch.currentQuantity,
        reason: `Sold to ${customerName}`,
        recordedBy: req.user._id,
      });
      await batch.save();
    }

    const balanceDue = Number((totalAmount - paid).toFixed(2));
    let paymentStatus = 'paid';
    if (paid === 0) paymentStatus = 'unpaid';
    else if (balanceDue > 0) paymentStatus = 'partial';

    const receiptNumber = `RCP-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const sale = await Sale.create({
      farm: req.farmId,
      batch: batchId || undefined,
      receiptNumber,
      productCategory,
      productDescription,
      customerName,
      customerPhone,
      quantity: qty,
      unitLabel: unitLabel || (productCategory === 'Eggs' ? 'crates' : 'birds'),
      unitPrice: price,
      totalAmount,
      amountPaid: paid,
      balanceDue,
      paymentMethod: paymentMethod || 'Cash',
      paymentStatus,
      salesDate: salesDate || new Date(),
      notes,
      recordedBy: req.user._id,
    });

    res.status(201).json(sale);
  } catch (error) {
    next(error);
  }
};

exports.recordBalancePayment = async (req, res, next) => {
  try {
    const sale = await Sale.findOne({ _id: req.params.id, farm: req.farmId });
    if (!sale) return res.status(404).json({ message: 'Sale invoice not found.' });

    const additionalPayment = Number(req.body.amount);
    if (additionalPayment <= 0 || additionalPayment > sale.balanceDue) {
      return res.status(400).json({ message: `Payment must be between 1 and ${sale.balanceDue}.` });
    }

    sale.amountPaid += additionalPayment;
    sale.balanceDue = Number((sale.totalAmount - sale.amountPaid).toFixed(2));
    sale.paymentStatus = sale.balanceDue === 0 ? 'paid' : 'partial';
    await sale.save();

    res.json(sale);
  } catch (error) {
    next(error);
  }
};