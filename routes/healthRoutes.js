const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorizeFarmAccess } = require('../middleware/farmAccessMiddleware');
const {
  createVaccination,
  markVaccinationAdministered,
  getVaccinations,
  createMedication,
  getMedications,
} = require('../controllers/healthController');

router.use(protect, authorizeFarmAccess());

router.post('/vaccinations', createVaccination);
router.get('/vaccinations', getVaccinations);
router.patch('/vaccinations/:id/administer', markVaccinationAdministered);

router.post('/medications', createMedication);
router.get('/medications', getMedications);

module.exports = router;