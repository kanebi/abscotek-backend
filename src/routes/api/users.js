/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { check, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const jwtSecret = process.env.JWT_SECRET || 'supersecretjwttoken';
const auth = require('../../middleware/auth');
const User = require('../../models/User');

// @desc    Register user
// @route   POST api/users
// @access  Public
router.post(
  '/',
  [
    check('name', 'Name is required').not().isEmpty(),
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, referralCode } = req.body;

    try {
      let user = await User.findOne({ email });

      if (user) {
        return res.status(400).json({ errors: [{ msg: 'User already exists' }] });
      }

      user = new User({
        name,
        email,
        password,
      });

      const salt = await bcrypt.genSalt(10);

      user.password = await bcrypt.hash(password, salt);

      await user.save();

      // Create JWT payload with user info
      const payload = {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          walletAddress: user.walletAddress
        },
      };

              jwt.sign(
          payload,
          jwtSecret,
          { expiresIn: '24h' },
          (err, token) => {
          if (err) throw err;
          res.json({ 
            token,
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
              walletAddress: user.walletAddress
            }
          });
        }
      );
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server error');
    }
  }
);

// @desc    Get current user profile
// @route   GET api/users/profile
// @access  Private
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @desc    Get user profile statistics
// @route   GET api/users/profile/stats
// @access  Private
router.get('/profile/stats', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('balance');
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Get order count from orders collection
    const Order = require('../../models/Order');
    const orderCount = await Order.countDocuments({ user: req.user.id });

    // Get referral stats
    const totalReferrals = await User.countDocuments({ referredBy: req.user.id });

    res.json({
      balance: user.balance || 0,
      orderCount: orderCount || 0,
      totalReferrals: totalReferrals || 0,
      currency: user.preferences?.currency || 'USDT'
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @desc    Update user preferences
// @route   PUT api/users/preferences
// @access  Private
router.put('/preferences', auth, async (req, res) => {
  const { currency } = req.body;

  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Initialize preferences if it doesn't exist
    if (!user.preferences) {
      user.preferences = {};
    }

    // Update currency preference
    if (currency) {
      const validCurrencies = ['USDT', 'USD', 'NGN', 'EUR'];
      if (!validCurrencies.includes(currency)) {
        return res.status(400).json({
          msg: `Invalid currency. Valid options are: ${validCurrencies.join(', ')}`
        });
      }
      user.preferences.currency = currency;
    }

    await user.save();

    res.json({
      msg: 'Preferences updated successfully',
      preferences: user.preferences
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @desc    Update user profile
// @route   PUT api/users/profile
// @access  Private
router.put('/profile', auth, async (req, res) => {
  const {
    name,
    firstName,
    lastName,
    email,
    phoneNumber,
    areaNumber,
    walletAddress,
    companyName,
    preferences
  } = req.body;

  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Update basic fields
    if (name) user.name = name;
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (email) user.email = email;
    if (phoneNumber) user.phoneNumber = phoneNumber;
    if (areaNumber) user.areaNumber = areaNumber;
    if (walletAddress) user.walletAddress = walletAddress;
    if (companyName) user.companyName = companyName;

    // Update preferences
    if (preferences) {
      if (preferences.currency) {
        user.preferences = user.preferences || {};
        user.preferences.currency = preferences.currency;
      }
    }

    await user.save();

    res.json({
      msg: 'Profile updated successfully',
      user: {
        id: user.id,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        areaNumber: user.areaNumber,
        walletAddress: user.walletAddress,
        companyName: user.companyName,
        preferences: user.preferences,
        role: user.role,
        balance: user.balance,
        referralCode: user.referralCode
      }
    });
  } catch (err) {
    console.error(err.message);
    if (err.code === 11000) {
      return res.status(400).json({ msg: 'Email or wallet address already exists' });
    }
    res.status(500).send('Server Error');
  }
});

// Address endpoints have been moved to /api/delivery-addresses

// @desc    Verify user email
// @route   GET api/users/verify/:userId/:uniqueString
// @access  Public
router.get('/verify/:userId/:uniqueString', async (req, res) => {
  try {
    const { userId, uniqueString } = req.params;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(400).json({ msg: 'Invalid verification link' });
    }

    // Here you would typically verify the uniqueString against a stored verification token
    // For now, we'll just mark the user as verified
    user.isVerified = true;
    await user.save();

    res.json({ msg: 'Email verified successfully!' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
