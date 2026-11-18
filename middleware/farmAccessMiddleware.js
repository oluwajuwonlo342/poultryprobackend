const Farm = require('../models/Farm');
const FarmMembership = require('../models/FarmMembership');

/**
 * Verifies user owns the requested farm OR holds an active worker membership.
 * Optionally checks a specific worker permission flag (e.g., 'viewFinancials').
 */
const authorizeFarmAccess = (requiredPermission = null) => {
  return async (req, res, next) => {
    try {
      const farmId = req.params.farmId || req.headers['x-farm-id'] || req.body.farm;
      if (!farmId) {
        return res.status(400).json({ message: 'Farm context (farmId) is required.' });
      }

      if (req.user.role === 'super_admin') {
        req.farmId = farmId;
        return next();
      }

      const farm = await Farm.findOne({ _id: farmId, isArchived: false });
      if (!farm) {
        return res.status(404).json({ message: 'Farm not found or has been archived.' });
      }

      // Farm Owner has unrestricted access to their own farm
      if (farm.owner.toString() === req.user._id.toString()) {
        req.farm = farm;
        req.farmId = farm._id;
        req.isFarmOwner = true;
        return next();
      }

      // Check active FarmMembership for workers
      const membership = await FarmMembership.findOne({
        farm: farmId,
        user: req.user._id,
        status: 'active',
      });

      if (!membership) {
        return res.status(403).json({ message: 'Access denied to this farm.' });
      }

      if (requiredPermission && !membership.permissions[requiredPermission]) {
        return res.status(403).json({
          message: `Insufficient permissions: '${requiredPermission}' access is required.`,
        });
      }

      req.farm = farm;
      req.farmId = farm._id;
      req.isFarmOwner = false;
      req.workerPermissions = membership.permissions;
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = { authorizeFarmAccess };