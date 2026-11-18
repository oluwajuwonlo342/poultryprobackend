const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorizeFarmAccess } = require('../middleware/farmAccessMiddleware');
const { requirePlanFeature } = require('../middleware/subscriptionMiddleware');
const FeedProduct = require('../models/FeedProduct');
const FeedTransaction = require('../models/FeedTransaction');

// Require authenticated user, active farm access, and Starter+ subscription plan
router.use(protect, authorizeFarmAccess('manageInventory'), requirePlanFeature('hasFeedInventory'));

// List all feed products for the active farm
router.get('/', async (req, res, next) => {
  try {
    const products = await FeedProduct.find({ farm: req.farmId }).sort({ productName: 1 });
    res.json(products);
  } catch (err) {
    next(err);
  }
});

// Create a new feed product (with optional opening stock)
router.post('/', async (req, res, next) => {
  try {
    const {
      productName,
      feedType,
      manufacturer,
      initialStockKg = 0,
      lowStockThresholdKg = 100,
      purchasePriceTotal = 0,
      supplier = '',
    } = req.body;

    const qty = Number(initialStockKg) || 0;
    const totalCost = Number(purchasePriceTotal) || 0;
    const unitCost = qty > 0 && totalCost > 0 ? Number((totalCost / qty).toFixed(2)) : 0;

    const product = await FeedProduct.create({
      farm: req.farmId,
      productName,
      feedType,
      manufacturer,
      currentStockKg: qty,
      lowStockThresholdKg: Number(lowStockThresholdKg) || 100,
      weightedAvgCostPerKg: unitCost,
      supplier,
    });

    if (qty > 0) {
      await FeedTransaction.create({
        farm: req.farmId,
        feedProduct: product._id,
        transactionType: 'purchase',
        quantityKg: qty,
        unitCostPerKg: unitCost,
        totalCost,
        supplier,
        notes: 'Opening feed inventory stock',
        recordedBy: req.user._id,
      });
    }

    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
});

// Record a feed restock / purchase and recalculate weighted average cost per kg
router.post('/purchase', async (req, res, next) => {
  try {
    const { feedProductId, quantityKg, totalCost, supplier, notes } = req.body;
    const qty = Number(quantityKg);
    const cost = Number(totalCost) || 0;

    if (!qty || qty <= 0) {
      return res.status(400).json({ message: 'Quantity purchased must be greater than 0 kg.' });
    }

    const product = await FeedProduct.findOne({ _id: feedProductId, farm: req.farmId });
    if (!product) {
      return res.status(404).json({ message: 'Feed product not found.' });
    }

    const existingValue = product.currentStockKg * product.weightedAvgCostPerKg;
    const newTotalStock = product.currentStockKg + qty;
    const newWeightedCost =
      newTotalStock > 0 ? Number(((existingValue + cost) / newTotalStock).toFixed(2)) : product.weightedAvgCostPerKg;

    product.currentStockKg = newTotalStock;
    product.weightedAvgCostPerKg = newWeightedCost;
    if (supplier) product.supplier = supplier;
    await product.save();

    const transaction = await FeedTransaction.create({
      farm: req.farmId,
      feedProduct: product._id,
      transactionType: 'purchase',
      quantityKg: qty,
      unitCostPerKg: qty > 0 ? Number((cost / qty).toFixed(2)) : 0,
      totalCost: cost,
      supplier: supplier || product.supplier,
      notes: notes || 'Feed restock purchase',
      recordedBy: req.user._id,
    });

    res.status(201).json({ product, transaction });
  } catch (err) {
    next(err);
  }
});

// List recent feed inventory movements
router.get('/transactions', async (req, res, next) => {
  try {
    const transactions = await FeedTransaction.find({ farm: req.farmId })
      .populate('feedProduct', 'productName feedType')
      .populate('recordedBy', 'fullName')
      .sort({ transactionDate: -1 })
      .limit(50);

    res.json(transactions);
  } catch (err) {
    next(err);
  }
});

module.exports = router;