// server/models/Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    farm: { type: mongoose.Schema.Types.ObjectId, ref: 'Farm' },
    type: {
      type: String,
      enum: [
        'vaccination_reminder',
        'medication_reminder',
        'low_feed_stock',
        'unusual_mortality',
        'unpaid_balance',
        'subscription_expiry',
        'system_announcement',
      ],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    actionLink: { type: String, default: '/dashboard' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);