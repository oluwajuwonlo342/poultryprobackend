const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorizeFarmAccess } = require('../middleware/farmAccessMiddleware');
const { createDailyRecord, getDailyRecords } = require('../controllers/dailyRecordController');

router.use(protect, authorizeFarmAccess());

router.post('/', createDailyRecord);
router.get('/', getDailyRecords);

module.exports = router;