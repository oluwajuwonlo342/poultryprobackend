const Subscription = require('../models/Subscription');
const Farm = require('../models/Farm');
const Batch = require('../models/Batch');
const FarmMembership = require('../models/FarmMembership');

const getActiveLimits = async (userId) => {
  const sub = await Subscription.findOne({ user: userId }).populate('plan');
  if (!sub || sub.status !== 'active' || !sub.plan) {
    return {
      maxFarms: 1,
      maxActiveBatchesPerFarm: 2,
      maxWorkers: 0,
      hasFinancialTracking: false,
      hasFeedInventory: false,
      hasAdvancedAnalytics: false,
      hasPdfExcelExport: false,
      hasSmartAssistant: false,
    };
  }
  return sub.plan.limits;
};

// Check boolean feature flags (e.g., 'hasSmartAssistant', 'hasPdfExcelExport')
const requirePlanFeature = (featureKey) => async (req, res, next) => {
  try {
    if (req.user.role === 'super_admin') return next();
    const ownerId = req.farm?.owner || req.user._id;
    const limits = await getActiveLimits(ownerId);

    if (!limits[featureKey]) {
      return res.status(403).json({
        message: `Your current subscription plan does not include this feature (${featureKey}). Please upgrade your plan.`,
      });
    }
    next();
  } catch (err) {
    next(err);
  }
};

// Check numeric quotas ('farms', 'batches', or 'workers')
const checkPlanQuota = (resourceType) => async (req, res, next) => {
  try {
    if (req.user.role === 'super_admin') return next();
    const limits = await getActiveLimits(req.user._id);

    if (resourceType === 'farms') {
      const count = await Farm.countDocuments({ owner: req.user._id, isArchived: false });
      if (count >= limits.maxFarms) {
        return res.status(403).json({
          message: `Plan limit reached: Your plan allows up to ${limits.maxFarms} farm(s). Upgrade to add more.`,
        });
      }
    }

    if (resourceType === 'batches') {
      const count = await Batch.countDocuments({ farm: req.farmId, status: 'active' });
      if (count >= limits.maxActiveBatchesPerFarm) {
        return res.status(403).json({
          message: `Plan limit reached: Your plan allows up to ${limits.maxActiveBatchesPerFarm} active batch(es) per farm.`,
        });
      }
    }

    if (resourceType === 'workers') {
      const count = await FarmMembership.countDocuments({ farm: req.farmId, status: 'active' });
      if (count >= limits.maxWorkers) {
        return res.status(403).json({
          message: `Plan limit reached: Your plan allows up to ${limits.maxWorkers} worker(s).`,
        });
      }
    }

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { requirePlanFeature, checkPlanQuota };