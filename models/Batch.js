const mongoose = require('mongoose');

const populationAdjustmentSchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now },
    type: {
      type: String,
      enum: ['initial', 'addition', 'mortality', 'sale', 'cull_or_adjustment'],
      required: true,
    },
    quantityChange: { type: Number, required: true }, // positive or negative
    balanceAfter: { type: Number, required: true },
    reason: { type: String, trim: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const batchSchema = new mongoose.Schema(
  {
    farm: { type: mongoose.Schema.Types.ObjectId, ref: 'Farm', required: true, index: true },
    batchName: { type: String, required: true, trim: true },
    batchCode: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['Broilers', 'Layers', 'Cockerels', 'Turkeys', 'Others'],
      required: true,
    },
    breed: { type: String, trim: true }, // e.g., Ross 308, Isa Brown, Noiler
    initialQuantity: { type: Number, required: true, min: 1 },
    currentQuantity: { type: Number, required: true, min: 0 },
    totalMortality: { type: Number, default: 0, min: 0 },
    totalSold: { type: Number, default: 0, min: 0 },
    purchaseDate: { type: Date, required: true },
    arrivalDate: { type: Date, required: true },
    ageAtArrivalDays: { type: Number, default: 1, min: 0 },
    initialAvgWeightKg: { type: Number, default: 0.042, min: 0.01 }, // ~42g day-old chick
    latestAvgWeightKg: { type: Number, default: 0.042, min: 0.01 },
    supplier: { type: String, trim: true },
    purchaseCost: { type: Number, required: true, min: 0 },
    housingLocation: { type: String, trim: true }, // e.g., Pen House A
    notes: { type: String, trim: true },
    status: {
      type: String,
      enum: ['active', 'completed', 'archived'],
      default: 'active',
    },
    populationHistory: [populationAdjustmentSchema],
  },
  { timestamps: true }
);

batchSchema.index({ farm: 1, batchCode: 1 }, { unique: true });

module.exports = mongoose.model('Batch', batchSchema);