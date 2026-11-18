// server/models/Sale.js
const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema(
  {
    farm: { type: mongoose.Schema.Types.ObjectId, ref: 'Farm', required: true, index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
    receiptNumber: { type: String, required: true, unique: true },
    productCategory: {
      type: String,
      enum: ['Eggs', 'Live Birds', 'Manure', 'Other'],
      required: true,
    },
    productDescription: { type: String, trim: true },
    customerName: { type: String, required: true, trim: true },
    customerPhone: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 1 }, // Individual eggs or bird count
    unitLabel: { type: String, default: 'units' }, // e.g., 'crates (30)', 'eggs', 'birds', 'bags'
    unitPrice: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, required: true, min: 0 },
    balanceDue: { type: Number, default: 0, min: 0 },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'Bank Transfer', 'POS', 'Paystack', 'Credit'],
      default: 'Cash',
    },
    paymentStatus: {
      type: String,
      enum: ['paid', 'partial', 'unpaid'],
      default: 'paid',
    },
    salesDate: { type: Date, default: Date.now, index: true },
    notes: { type: String, trim: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Sale', saleSchema);