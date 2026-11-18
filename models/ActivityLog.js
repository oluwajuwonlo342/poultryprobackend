// server/models/ActivityLog.js
const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    farm: { type: mongoose.Schema.Types.ObjectId, ref: 'Farm', index: true },
    action: { type: String, required: true }, // e.g., "CREATED_BATCH", "RECORDED_MORTALITY"
    module: { type: String, required: true }, // e.g., "Batches", "Inventory", "Billing"
    details: { type: String },
    ipAddress: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('ActivityLog', activityLogSchema);