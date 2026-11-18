// server/models/SubscriptionPlan.js
const mongoose = require('mongoose');

const subscriptionPlanSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      enum: ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'],
      unique: true,
      required: true,
    },
    name: { type: String, required: true },
    description: { type: String },
    monthlyPriceNGN: { type: Number, required: true, default: 0 },
    annualPriceNGN: { type: Number, required: true, default: 0 },
    limits: {
      maxFarms: { type: Number, default: 1 },
      maxActiveBatchesPerFarm: { type: Number, default: 2 },
      maxWorkers: { type: Number, default: 0 },
      hasFinancialTracking: { type: Boolean, default: false },
      hasFeedInventory: { type: Boolean, default: false },
      hasAdvancedAnalytics: { type: Boolean, default: false },
      hasPdfExcelExport: { type: Boolean, default: false },
      hasSmartAssistant: { type: Boolean, default: false },
      hasAutomatedReminders: { type: Boolean, default: false },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);