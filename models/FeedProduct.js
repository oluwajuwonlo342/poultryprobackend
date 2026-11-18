// server/models/FeedProduct.js
const mongoose = require('mongoose');

const feedProductSchema = new mongoose.Schema(
  {
    farm: { type: mongoose.Schema.Types.ObjectId, ref: 'Farm', required: true, index: true },
    productName: { type: String, required: true, trim: true },
    feedType: {
      type: String,
      enum: ['Pre-Starter', 'Starter', 'Grower', 'Finisher', 'Chick Mash', 'Grower Mash', 'Layer Mash', 'Concentrate'],
      required: true,
    },
    manufacturer: { type: String, trim: true }, // e.g., Top Feeds, Ultima, Chikun, New Hope
    unit: { type: String, enum: ['kg', 'bag_25kg', 'bag_50kg'], default: 'kg' },
    currentStockKg: { type: Number, required: true, default: 0, min: 0 },
    lowStockThresholdKg: { type: Number, default: 100, min: 0 },
    weightedAvgCostPerKg: { type: Number, default: 0, min: 0 },
    supplier: { type: String, trim: true },
    expiryDate: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('FeedProduct', feedProductSchema);