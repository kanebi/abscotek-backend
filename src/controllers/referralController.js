const Referral = require('../models/Referral');
const User = require('../models/User');
const { v4: uuidv4 } = require('uuid');

// @desc    Generate a referral link for the authenticated user
// @route   POST /api/referrals/generate
// @access  Private
const generateReferralLink = async (req, res) => {
  try {
    let referral = await Referral.findOne({ referrer: req.user.id });

    if (referral) {
      return res.json({ referralCode: referral.referralCode });
    }

    const referralCode = uuidv4();

    referral = new Referral({
      referrer: req.user.id,
      referralCode,
    });

    await referral.save();

    res.json({ referralCode });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Get referred users for the authenticated user
// @route   GET /api/referrals/referred-users
// @access  Private
const getReferredUsers = async (req, res) => {
  try {
    const referredUsers = await User.find({ referredBy: req.user.id }).select('-password');
    res.json(referredUsers);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

module.exports = {
  generateReferralLink,
  getReferredUsers,
};
