// server/models/Subscription.js
const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
    planCode: { type: String, default: 'FREE' },
    billingCycle: { type: String, enum: ['monthly', 'annual'], default: 'monthly' },
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled', 'past_due'],
      default: 'active',
    },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },
    paystackSubscriptionCode: String,
    paystackCustomerCode: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Subscription', subscriptionSchema);