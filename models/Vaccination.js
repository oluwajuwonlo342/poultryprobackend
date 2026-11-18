// server/models/Vaccination.js
const mongoose = require('mongoose');

const vaccinationSchema = new mongoose.Schema(
  {
    farm: { type: mongoose.Schema.Types.ObjectId, ref: 'Farm', required: true, index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    vaccineName: { type: String, required: true, trim: true }, // e.g., Lasota, Gumboro, Marek's
    scheduledDate: { type: Date, required: true, index: true },
    administrationDate: { type: Date },
    dosage: { type: String, trim: true },
    administrationMethod: {
      type: String,
      enum: ['Drinking Water', 'Eye Drop', 'Subcutaneous Injection', 'Intramuscular Injection', 'Spray', 'Wing Web'],
      default: 'Drinking Water',
    },
    status: {
      type: String,
      enum: ['scheduled', 'completed', 'overdue', 'missed'],
      default: 'scheduled',
    },
    nextScheduledDate: { type: Date },
    personResponsible: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, trim: true },
    reminderSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Vaccination', vaccinationSchema);