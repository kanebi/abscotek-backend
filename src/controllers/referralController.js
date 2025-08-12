const Referral = require('../models/Referral');
const User = require('../models/User');
const { v4: uuidv4 } = require('uuid');

const REFERRAL_REWARD_AMOUNT = 10; // 10 USDT

// @desc    Generate a referral link for the authenticated user
// @route   POST /api/referrals/generate
// @access  Private
const generateReferralLink = async (req, res) => {
  try {
    let referral = await Referral.findOne({ referrer: req.user.id });

    if (referral) {
      return res.json({ referralCode: referral.referralCode });
    }

    // Attempt to generate a unique referral code, retrying on duplicates
    let attempts = 0;
    const maxAttempts = 5;
    while (attempts < maxAttempts) {
      try {
        const referralCode = uuidv4();
        referral = new Referral({ referrer: req.user.id, referralCode });
        await referral.save();
        return res.json({ referralCode });
      } catch (e) {
        attempts += 1;
        // If duplicate referralCode or legacy index issue, retry a few times
        if (e && e.code === 11000 && attempts < maxAttempts) {
          continue;
        }
        console.error('Referral save error:', e.message);
        return res.status(500).json({ errors: [{ msg: 'Server error' }] });
      }
    }
    return res.status(500).json({ errors: [{ msg: 'Server error' }] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ errors: [{ msg: 'Server error' }] });
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
    res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

// @desc    Award referral bonus to referrer
// @access  Private (called internally)
const awardReferralBonus = async (referredUserId) => {
  try {
    const referredUser = await User.findById(referredUserId);

    if (referredUser && referredUser.referredBy) {
      const referrer = await User.findById(referredUser.referredBy);

      if (referrer) {
        referrer.balance += REFERRAL_REWARD_AMOUNT;
        await referrer.save();
        console.log(`Awarded ${REFERRAL_REWARD_AMOUNT} USDT to referrer ${referrer.id}`);
      }
    }
  } catch (err) {
    console.error('Error awarding referral bonus:', err.message);
  }
};

module.exports = {
  generateReferralLink,
  getReferredUsers,
  awardReferralBonus,
};