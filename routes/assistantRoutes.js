const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorizeFarmAccess } = require('../middleware/farmAccessMiddleware');
const {
  askFarmAssistant,
  getConversations,
  getConversationById,
  deleteConversation,
} = require('../controllers/assistantController');

router.use(protect, authorizeFarmAccess());

router.get('/conversations', getConversations);
router.get('/conversations/:id', getConversationById);
router.delete('/conversations/:id', deleteConversation);
router.post('/ask', askFarmAssistant);

module.exports = router;