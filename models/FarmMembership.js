// server/models/FarmMembership.js
const mongoose = require('mongoose');

const farmMembershipSchema = new mongoose.Schema(
  {
    farm: { type: mongoose.Schema.Types.ObjectId, ref: 'Farm', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    jobTitle: { type: String, default: 'Farm Attendant' },
    permissions: {
      recordFeeding: { type: Boolean, default: true },
      recordWater: { type: Boolean, default: true },
      recordMortality: { type: Boolean, default: true },
      recordEggs: { type: Boolean, default: true },
      recordHealth: { type: Boolean, default: false },
      viewBatches: { type: Boolean, default: true },
      manageInventory: { type: Boolean, default: false },
      viewFinancials: { type: Boolean, default: false },
      manageSales: { type: Boolean, default: false },
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'invited'],
      default: 'active',
    },
  },
  { timestamps: true }
);

farmMembershipSchema.index({ farm: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('FarmMembership', farmMembershipSchema);