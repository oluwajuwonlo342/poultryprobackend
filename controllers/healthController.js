const Vaccination = require('../models/Vaccination');
const Medication = require('../models/Medication');
const Batch = require('../models/Batch');

exports.createVaccination = async (req, res, next) => {
  try {
    const {
      batchId,
      vaccineName,
      scheduledDate,
      administrationDate,
      dosage,
      administrationMethod,
      nextScheduledDate,
      notes,
    } = req.body;

    const batch = await Batch.findOne({ _id: batchId, farm: req.farmId });
    if (!batch) return res.status(404).json({ message: 'Batch not found.' });

    const vaccination = await Vaccination.create({
      farm: req.farmId,
      batch: batch._id,
      vaccineName,
      scheduledDate,
      administrationDate: administrationDate || undefined,
      dosage,
      administrationMethod,
      status: administrationDate ? 'completed' : 'scheduled',
      nextScheduledDate: nextScheduledDate || undefined,
      personResponsible: req.user._id,
      notes,
    });

    res.status(201).json(vaccination);
  } catch (error) {
    next(error);
  }
};

exports.markVaccinationAdministered = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { administrationDate, nextScheduledDate, dosage, notes } = req.body;

    const vaccination = await Vaccination.findOne({ _id: id, farm: req.farmId });
    if (!vaccination) return res.status(404).json({ message: 'Vaccination schedule not found.' });

    vaccination.status = 'completed';
    vaccination.administrationDate = administrationDate || new Date();
    if (dosage) vaccination.dosage = dosage;
    if (nextScheduledDate) vaccination.nextScheduledDate = nextScheduledDate;
    if (notes) vaccination.notes = notes;
    vaccination.personResponsible = req.user._id;
    await vaccination.save();

    // Automatically queue follow-up booster if nextScheduledDate was provided
    if (nextScheduledDate) {
      await Vaccination.create({
        farm: req.farmId,
        batch: vaccination.batch,
        vaccineName: `${vaccination.vaccineName} (Booster)`,
        scheduledDate: nextScheduledDate,
        dosage: vaccination.dosage,
        administrationMethod: vaccination.administrationMethod,
        status: 'scheduled',
        personResponsible: req.user._id,
      });
    }

    res.json(vaccination);
  } catch (error) {
    next(error);
  }
};

exports.getVaccinations = async (req, res, next) => {
  try {
    const { batchId, status } = req.query;
    const filter = { farm: req.farmId };
    if (batchId) filter.batch = batchId;
    if (status) filter.status = status;

    const list = await Vaccination.find(filter)
      .populate('batch', 'batchName batchCode category')
      .populate('personResponsible', 'fullName')
      .sort({ scheduledDate: 1 });

    res.json(list);
  } catch (error) {
    next(error);
  }
};

exports.createMedication = async (req, res, next) => {
  try {
    const { batchId, medicationName, reason, dosage, startDate, endDate, administrationInstructions, notes } =
      req.body;

    const batch = await Batch.findOne({ _id: batchId, farm: req.farmId });
    if (!batch) return res.status(404).json({ message: 'Batch not found.' });

    const med = await Medication.create({
      farm: req.farmId,
      batch: batch._id,
      medicationName,
      reason,
      dosage,
      startDate,
      endDate,
      administrationInstructions,
      personResponsible: req.user._id,
      notes,
    });

    res.status(201).json(med);
  } catch (error) {
    next(error);
  }
};

exports.getMedications = async (req, res, next) => {
  try {
    const filter = { farm: req.farmId };
    if (req.query.batchId) filter.batch = req.query.batchId;

    const meds = await Medication.find(filter)
      .populate('batch', 'batchName batchCode')
      .populate('personResponsible', 'fullName')
      .sort({ startDate: -1 });

    res.json(meds);
  } catch (error) {
    next(error);
  }
};