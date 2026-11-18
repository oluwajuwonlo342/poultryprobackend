const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');
const {
  registerUser,
  loginUser,
  getMe,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/me', protect, getMe);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Update personal profile (fullName & phone)
router.put('/profile', protect, async (req, res, next) => {
  try {
    const { fullName, phone } = req.body;
    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ message: 'Full name is required.' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { fullName: fullName.trim(), phone: phone?.trim() || '' },
      { new: true }
    ).select('-password');

    res.json({ message: 'Profile updated successfully.', user: updatedUser });
  } catch (err) {
    next(err);
  }
});

// Change account password
router.put('/change-password', protect, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters long.' });
    }

    const user = await User.findById(req.user._id);
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect.' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;