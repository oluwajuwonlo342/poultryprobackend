// server/models/FeedTransaction.js
const mongoose = require('mongoose');

const feedTransactionSchema = new mongoose.Schema(
  {
    farm: { type: mongoose.Schema.Types.ObjectId, ref: 'Farm', required: true, index: true },
    feedProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'FeedProduct', required: true, index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
    transactionType: {
      type: String,
      enum: ['purchase', 'consumption', 'adjustment'],
      required: true,
    },
    quantityKg: { type: Number, required: true }, // Positive for purchase/add, negative for consumption
    unitCostPerKg: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    supplier: { type: String, trim: true },
    transactionDate: { type: Date, default: Date.now },
    notes: { type: String, trim: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FeedTransaction', feedTransactionSchema);