const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorizeFarmAccess } = require('../middleware/farmAccessMiddleware');
const { requirePlanFeature } = require('../middleware/subscriptionMiddleware');
const { askFarmAssistant } = require('../controllers/assistantController');

router.post('/ask', protect, authorizeFarmAccess(), requirePlanFeature('hasSmartAssistant'), askFarmAssistant);

module.exports = router;