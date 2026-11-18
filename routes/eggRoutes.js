const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorizeFarmAccess } = require('../middleware/farmAccessMiddleware');
const { recordEggProduction, getEggProduction } = require('../controllers/eggSalesController');

router.use(protect, authorizeFarmAccess('recordEggs'));

router.post('/', recordEggProduction);
router.get('/', getEggProduction);

module.exports = router;