const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/authMiddleware');
const { authorizeFarmAccess } = require('../middleware/farmAccessMiddleware');
const Farm = require('../models/Farm');
const FarmMembership = require('../models/FarmMembership');
const User = require('../models/User');

// Create a new farm (Farm Owners)
router.post('/', protect, requireRole('farm_owner'), async (req, res, next) => {
  try {
    const farm = await Farm.create({ ...req.body, owner: req.user._id });
    res.status(201).json(farm);
  } catch (err) {
    next(err);
  }
});

// List accessible farms
router.get('/', protect, async (req, res, next) => {
  try {
    if (req.user.role === 'farm_owner') {
      const farms = await Farm.find({ owner: req.user._id, isArchived: false });
      return res.json(farms);
    }
    const memberships = await FarmMembership.find({ user: req.user._id, status: 'active' }).populate('farm');
    res.json(memberships.filter((m) => m.farm && !m.farm.isArchived).map((m) => m.farm));
  } catch (err) {
    next(err);
  }
});

// Update or archive farm
router.put('/:farmId', protect, authorizeFarmAccess(), async (req, res, next) => {
  try {
    if (!req.isFarmOwner) return res.status(403).json({ message: 'Only farm owners can edit farm settings.' });
    const updated = await Farm.findByIdAndUpdate(req.farmId, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Worker Management: Invite / Assign Worker to Farm
router.post('/:farmId/workers', protect, authorizeFarmAccess(), async (req, res, next) => {
  try {
    if (!req.isFarmOwner) return res.status(403).json({ message: 'Only farm owners can invite workers.' });
    const { fullName, email, phone, password, jobTitle, permissions } = req.body;

    let workerUser = await User.findOne({ email: email.toLowerCase() });
    if (!workerUser) {
      workerUser = await User.create({
        fullName,
        email,
        phone,
        password: password || 'Worker@123',
        role: 'farm_worker',
      });
    }

    const membership = await FarmMembership.findOneAndUpdate(
      { farm: req.farmId, user: workerUser._id },
      {
        invitedBy: req.user._id,
        jobTitle: jobTitle || 'Farm Attendant',
        permissions,
        status: 'active',
      },
      { upsert: true, new: true }
    ).populate('user', 'fullName email phone accountStatus');

    res.status(201).json(membership);
  } catch (err) {
    next(err);
  }
});

// List farm workers
router.get('/:farmId/workers', protect, authorizeFarmAccess(), async (req, res, next) => {
  try {
    const workers = await FarmMembership.find({ farm: req.farmId }).populate(
      'user',
      'fullName email phone accountStatus'
    );
    res.json(workers);
  } catch (err) {
    next(err);
  }
});

module.exports = router;