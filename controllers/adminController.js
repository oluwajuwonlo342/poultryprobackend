const User = require('../models/User');
const Farm = require('../models/Farm');
const Subscription = require('../models/Subscription');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const Payment = require('../models/Payment');
const SupportTicket = require('../models/SupportTicket');
const ActivityLog = require('../models/ActivityLog');

exports.getPlatformOverview = async (req, res, next) => {
  try {
    const [
      totalUsers,
      activeFarmers,
      totalFarms,
      activeSubscriptions,
      successfulPaymentsAgg,
      failedTransactions,
      subscriptionDistribution,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'farm_owner', accountStatus: 'active' }),
      Farm.countDocuments({ isArchived: false }),
      Subscription.countDocuments({ status: 'active', planCode: { $ne: 'FREE' } }),
      Payment.aggregate([
        { $match: { status: 'success' } },
        { $group: { _id: null, totalRevenueNGN: { $sum: '$amountNGN' }, count: { $sum: 1 } } },
      ]),
      Payment.countDocuments({ status: 'failed' }),
      Subscription.aggregate([{ $group: { _id: '$planCode', count: { $sum: 1 } } }]),
    ]);

    res.json({
      totalUsers,
      activeFarmers,
      totalFarms,
      activePaidSubscriptions: activeSubscriptions,
      totalPlatformRevenueNGN: successfulPaymentsAgg[0]?.totalRevenueNGN || 0,
      successfulTransactionsCount: successfulPaymentsAgg[0]?.count || 0,
      failedTransactionsCount: failedTransactions,
      subscriptionDistribution,
    });
  } catch (error) {
    next(error);
  }
};

exports.toggleUserAccountStatus = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { accountStatus } = req.body; // 'active' or 'suspended'
    const user = await User.findByIdAndUpdate(userId, { accountStatus }, { new: true });
    if (!user) return res.status(404).json({ message: 'User not found.' });

    await ActivityLog.create({
      user: req.user._id,
      action: `USER_${accountStatus.toUpperCase()}`,
      module: 'SuperAdmin',
      details: `Changed status of ${user.email} to ${accountStatus}`,
    });

    res.json(user);
  } catch (error) {
    next(error);
  }
};

exports.updateSubscriptionPlan = async (req, res, next) => {
  try {
    const plan = await SubscriptionPlan.findByIdAndUpdate(req.params.planId, req.body, { new: true });
    if (!plan) return res.status(404).json({ message: 'Subscription plan not found.' });
    res.json(plan);
  } catch (error) {
    next(error);
  }
};