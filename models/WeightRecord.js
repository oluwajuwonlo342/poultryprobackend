// server/models/WeightRecord.js
const mongoose = require('mongoose');

const weightRecordSchema = new mongoose.Schema(
  {
    farm: { type: mongoose.Schema.Types.ObjectId, ref: 'Farm', required: true, index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    measurementDate: { type: Date, required: true },
    birdsSampled: { type: Number, required: true, min: 1 },
    averageWeightKg: { type: Number, required: true, min: 0.01 },
    calculatedFCR: { type: Number, default: null }, // Populated automatically for meat birds
    notes: { type: String, trim: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WeightRecord', weightRecordSchema);