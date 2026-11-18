// server/models/Farm.js
const mongoose = require('mongoose');

const farmSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true }, // State / LGA
    address: { type: String, required: true, trim: true },
    farmType: {
      type: String,
      enum: ['Broiler', 'Layer', 'Cockerel', 'Turkey', 'Mixed Poultry'],
      required: true,
    },
    farmSize: { type: String, trim: true }, // e.g., "2 Acres" or "5,000 Bird Capacity"
    poultryHousesCount: { type: Number, default: 1, min: 1 },
    contactPhone: { type: String, trim: true },
    contactEmail: { type: String, trim: true },
    currency: { type: String, default: 'NGN' },
    eggStockAvailable: { type: Number, default: 0, min: 0 }, // Stored in individual eggs (30 eggs = 1 crate)
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Farm', farmSchema);