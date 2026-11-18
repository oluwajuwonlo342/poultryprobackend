const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorizeFarmAccess } = require('../middleware/farmAccessMiddleware');
const {
  createBatch,
  getBatchesWithMetrics,
  recordWeightSample,
} = require('../controllers/batchController');
const Batch = require('../models/Batch');

router.use(protect, authorizeFarmAccess('viewBatches'));

router.post('/', createBatch);
router.get('/', getBatchesWithMetrics);
router.post('/:batchId/weights', recordWeightSample);

router.put('/:batchId', async (req, res, next) => {
  try {
    const batch = await Batch.findOneAndUpdate(
      { _id: req.params.batchId, farm: req.farmId },
      req.body,
      { new: true }
    );
    if (!batch) return res.status(404).json({ message: 'Batch not found.' });
    res.json(batch);
  } catch (err) {
    next(err);
  }
});

module.exports = router;