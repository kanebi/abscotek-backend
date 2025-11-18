const Referral = require('../models/Referral');
const User = require('../models/User');
const Withdrawal = require('../models/Withdrawal');
const { v4: uuidv4 } = require('uuid');

const REFERRAL_REWARD_AMOUNT = 4; // 4 USDT

// @desc    Generate a referral link for the authenticated user
// @route   POST /api/referrals/generate
// @access  Private
const generateReferralLink = async (req, res) => {
  try {
    console.log('Generate referral link called for user:', req.user.id);
    console.log('User details:', { id: req.user.id, email: req.user.email, name: req.user.name });
    
    let referral = await Referral.findOne({ referrer: req.user.id });
    console.log('Existing referral found:', !!referral);

    if (referral) {
      console.log('Returning existing referral code:', referral.referralCode);
      return res.json({ referralCode: referral.referralCode });
    }

    // Attempt to generate a unique referral code, retrying on duplicates
    let attempts = 0;
    const maxAttempts = 5;
    while (attempts < maxAttempts) {
      try {
        const referralCode = uuidv4();
        console.log('Creating new referral with code:', referralCode);
        referral = new Referral({ referrer: req.user.id, referralCode });
        await referral.save();
        console.log('New referral saved successfully');
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

// @desc    Get referral statistics for the authenticated user
// @route   GET /api/referrals/stats
// @access  Private
const getReferralStats = async (req, res) => {
  try {
    // Get count of referred users
    const totalReferrals = await User.countDocuments({ referredBy: req.user.id });
    
    // Get user's current balance (referral bonus)
    const user = await User.findById(req.user.id).select('balance');
    const referralBonus = user?.balance || 0;

    res.json({
      totalReferrals,
      referralBonus
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

// @desc    Withdraw referral bonus
// @route   POST /api/referrals/withdraw
// @access  Private
const withdrawBonus = async (req, res) => {
  try {
    const { amount, walletAddress } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ errors: [{ msg: 'Invalid withdrawal amount' }] });
    }

    if (!walletAddress) {
      return res.status(400).json({ errors: [{ msg: 'Wallet address is required' }] });
    }

    // Validate wallet address format
    if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
      return res.status(400).json({ errors: [{ msg: 'Invalid wallet address format' }] });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ errors: [{ msg: 'User not found' }] });
    }

    if (user.balance < amount) {
      return res.status(400).json({ 
        errors: [{ msg: 'Insufficient balance' }],
        availableBalance: user.balance,
        requestedAmount: amount
      });
    }

    // Check if platform has sufficient balance (this would be checked against actual platform wallet)
    // For now, we'll assume platform has sufficient balance
    // In production, you would check the actual platform wallet balance here

    // Create withdrawal record
    const withdrawal = new Withdrawal({
      user: req.user.id,
      amount,
      walletAddress,
      status: 'pending',
      notes: 'Referral bonus withdrawal'
    });

    await withdrawal.save();

    // Deduct amount from user balance
    user.balance -= amount;
    await user.save();

    // In a production environment, you would:
    // 1. Queue the withdrawal for processing
    // 2. Process the actual blockchain transaction
    // 3. Update withdrawal status based on transaction result
    // 4. Send notification to user

    res.json({
      msg: 'Withdrawal request submitted successfully',
      withdrawalId: withdrawal._id,
      newBalance: user.balance,
      withdrawalAmount: amount,
      walletAddress,
      status: withdrawal.status
    });
  } catch (err) {
    console.error('Withdrawal error:', err.message);
    res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

// @desc    Get withdrawal history
// @route   GET /api/referrals/withdrawals
// @access  Private
const getWithdrawals = async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(withdrawals);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

module.exports = {
  generateReferralLink,
  getReferredUsers,
  getReferralStats,
  withdrawBonus,
  getWithdrawals,
  awardReferralBonus,
};