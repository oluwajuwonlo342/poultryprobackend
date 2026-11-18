// server/controllers/authController.js
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Farm = require('../models/Farm');
const FarmMembership = require('../models/FarmMembership');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const Subscription = require('../models/Subscription');
const ActivityLog = require('../models/ActivityLog');
const { sendEmail } = require('../utils/emailService');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

exports.register = async (req, res, next) => {
  try {
    const { fullName, email, phone, password, confirmPassword } = req.body;

    if (!fullName || !email || !phone || !password) {
      return res.status(400).json({ message: 'All registration fields are required.' });
    }
    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const verificationToken = crypto.randomBytes(24).toString('hex');
    const user = await User.create({
      fullName,
      email,
      phone,
      password,
      role: 'farm_owner',
      emailVerificationToken: verificationToken,
    });

    // Assign default FREE subscription plan
    const freePlan = await SubscriptionPlan.findOne({ code: 'FREE' });
    if (freePlan) {
      await Subscription.create({
        user: user._id,
        plan: freePlan._id,
        planCode: 'FREE',
        status: 'active',
      });
    }

    const verifyUrl = `${process.env.CLIENT_URL}/verify-email?token=${verificationToken}`;
    await sendEmail({
      to: user.email,
      subject: 'Welcome to PoultryPro — Verify Your Email',
      html: `<p>Hello <strong>${user.fullName}</strong>,</p><p>Welcome to PoultryPro! Click <a href="${verifyUrl}">here to verify your email address</a>.</p>`,
    });

    await ActivityLog.create({
      user: user._id,
      action: 'USER_REGISTERED',
      module: 'Auth',
      details: `New farm owner registered: ${user.email}`,
    });

    const token = signToken(user._id);
    res.status(201).json({
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
      farms: [],
      requiresOnboarding: true,
    });
  } catch (error) {
    next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    if (user.accountStatus === 'suspended') {
      return res.status(403).json({ message: 'Account suspended. Please contact PoultryPro support.' });
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    // Gather accessible farms (owned + worker memberships)
    let accessibleFarms = [];
    if (user.role === 'farm_owner') {
      accessibleFarms = await Farm.find({ owner: user._id, isArchived: false });
    } else if (user.role === 'farm_worker') {
      const memberships = await FarmMembership.find({ user: user._id, status: 'active' }).populate('farm');
      accessibleFarms = memberships
        .filter((m) => m.farm && !m.farm.isArchived)
        .map((m) => ({
          ...m.farm.toObject(),
          workerPermissions: m.permissions,
          jobTitle: m.jobTitle,
        }));
    }

    const subscription = await Subscription.findOne({ user: user._id }).populate('plan');
    const token = signToken(user._id);

    res.json({
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        notificationPreferences: user.notificationPreferences,
      },
      farms: accessibleFarms,
      subscription,
      requiresOnboarding: user.role === 'farm_owner' && accessibleFarms.length === 0,
    });
  } catch (error) {
    next(error);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    const user = req.user;
    let accessibleFarms = [];
    if (user.role === 'farm_owner') {
      accessibleFarms = await Farm.find({ owner: user._id, isArchived: false });
    } else if (user.role === 'farm_worker') {
      const memberships = await FarmMembership.find({ user: user._id, status: 'active' }).populate('farm');
      accessibleFarms = memberships
        .filter((m) => m.farm && !m.farm.isArchived)
        .map((m) => ({
          ...m.farm.toObject(),
          workerPermissions: m.permissions,
          jobTitle: m.jobTitle,
        }));
    }
    const subscription = await Subscription.findOne({ user: user._id }).populate('plan');

    res.json({
      user,
      farms: accessibleFarms,
      subscription,
      requiresOnboarding: user.role === 'farm_owner' && accessibleFarms.length === 0,
    });
  } catch (error) {
    next(error);
  }
};

exports.verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.body;
    const user = await User.findOne({ emailVerificationToken: token });
    if (!user) return res.status(400).json({ message: 'Invalid or expired verification token.' });

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    await user.save({ validateBeforeSave: false });

    res.json({ message: 'Email verified successfully.' });
  } catch (error) {
    next(error);
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const user = await User.findOne({ email: req.body.email?.toLowerCase() });
    if (!user) {
      return res.json({ message: 'If that email exists, a password reset link has been sent.' });
    }

    const resetToken = crypto.randomBytes(24).toString('hex');
    user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
    await sendEmail({
      to: user.email,
      subject: 'PoultryPro Password Reset Request',
      html: `<p>Click <a href="${resetUrl}">here to reset your PoultryPro password</a>. This link expires in 1 hour.</p>`,
    });

    res.json({ message: 'If that email exists, a password reset link has been sent.' });
  } catch (error) {
    next(error);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Password reset token is invalid or has expired.' });
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.json({ message: 'Password has been reset successfully. You can now log in.' });
  } catch (error) {
    next(error);
  }
};