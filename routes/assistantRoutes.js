// server/routes/assistantRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorizeFarmAccess } = require('../middleware/farmAccessMiddleware');
const { askFarmAssistant } = require('../controllers/assistantController');

router.post('/ask', protect, authorizeFarmAccess(), askFarmAssistant);

module.exports = router;