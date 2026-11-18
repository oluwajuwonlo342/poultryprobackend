const mongoose = require('mongoose');

const auditEntrySchema = new mongoose.Schema(
  {
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    editedAt: { type: Date, default: Date.now },
    previousValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
    reason: String,
  },
  { _id: false }
);

const dailyRecordSchema = new mongoose.Schema(
  {
    farm: { type: mongoose.Schema.Types.ObjectId, ref: 'Farm', required: true, index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    recordDate: { type: Date, required: true, index: true },
    recordType: {
      type: String,
      enum: ['feeding', 'water', 'mortality', 'cleaning', 'disinfection', 'observation'],
      required: true,
    },
    // Feeding specifics
    feedProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'FeedProduct' },
    feedType: { type: String, trim: true },
    feedCategory: { type: String, trim: true }, // Starter, Grower, Finisher, Layer Mash
    feedQuantityKg: { type: Number, default: 0, min: 0 },
    feedCostSnapshot: { type: Number, default: 0, min: 0 },
    // Water specifics
    waterLitres: { type: Number, default: 0, min: 0 },
    // Mortality specifics
    mortalityCount: { type: Number, default: 0, min: 0 },
    suspectedCause: { type: String, trim: true },
    // General
    description: { type: String, trim: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    auditHistory: [auditEntrySchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('DailyRecord', dailyRecordSchema);