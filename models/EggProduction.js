// server/models/EggProduction.js
const mongoose = require('mongoose');

const eggProductionSchema = new mongoose.Schema(
  {
    farm: { type: mongoose.Schema.Types.ObjectId, ref: 'Farm', required: true, index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    productionDate: { type: Date, required: true, index: true },
    totalCollected: { type: Number, required: true, min: 0 },
    goodEggs: { type: Number, required: true, min: 0 }, // Added to saleable egg inventory
    crackedEggs: { type: Number, default: 0, min: 0 },
    brokenEggs: { type: Number, default: 0, min: 0 },
    rejectedEggs: { type: Number, default: 0, min: 0 },
    otherLosses: { type: Number, default: 0, min: 0 },
    liveHenCountSnapshot: { type: Number, required: true, min: 0 },
    henDayPercentage: { type: Number, default: 0 },
    notes: { type: String, trim: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('EggProduction', eggProductionSchema);