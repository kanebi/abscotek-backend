const { ethers } = require('ethers');
const jwt = require('jsonwebtoken');
const jwtSecret = process.env.JWT_SECRET || 'supersecretjwttoken';
const User = require('../models/User');
const { v4: uuidv4 } = require('uuid');
const auth = require('../middleware/auth');
const { verifyAuthSignature, verifyLinkSignature } = require('../utils/signatureVerification');

const nonces = {}; // In-memory nonce store for simplicity. In production, use a database.

// @desc    Request a message to sign for authentication
// @route   POST /api/web3/request-signature
// @access  Public
exports.requestSignature = async (req, res) => {
  const { walletAddress } = req.body;

  if (!walletAddress) {
    return res.status(400).json({ msg: 'Wallet address is required' });
  }

  try {
    // Check if user exists, create if not
    let user = await User.findOne({ walletAddress });

    if (!user) {
      user = new User({
        walletAddress,
        role: 'user',
        name: `User_${walletAddress.slice(0, 8)}`, // Generate a default name
      });
      await user.save();
    }

    const nonce = uuidv4();
    nonces[walletAddress] = {
      nonce,
      timestamp: Date.now(),
      userId: user._id
    };

    res.json({ 
      nonce,
      message: `Please sign this message to authenticate: ${nonce}`,
      walletAddress 
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// @desc    Verify a signed message and authenticate the user
// @route   POST /api/web3/verify-signature
// @access  Public
exports.verifySignature = async (req, res) => {
  const { walletAddress, signature } = req.body;

  if (!walletAddress || !signature) {
    return res.status(400).json({ msg: 'Wallet address and signature are required' });
  }

  try {
    const nonceData = nonces[walletAddress];

    if (!nonceData) {
      return res.status(400).json({ msg: 'Invalid or expired nonce' });
    }

    // Check if nonce is expired (5 minutes)
    if (Date.now() - nonceData.timestamp > 5 * 60 * 1000) {
      delete nonces[walletAddress];
      return res.status(400).json({ msg: 'Nonce expired' });
    }

    // Verify signature using utility function
    const isValid = verifyAuthSignature(nonceData.nonce, signature, walletAddress);

    if (!isValid) {
      return res.status(401).json({ msg: 'Invalid signature' });
    }

    // Invalidate the nonce after use
    delete nonces[walletAddress];

    let user = await User.findById(nonceData.userId);

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Create JWT payload with user info
    const payload = {
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        role: user.role,
        name: user.name,
        email: user.email
      },
    };

    jwt.sign(
      payload,
      jwtSecret,
      { expiresIn: '24h' }, // 24 hour expiry
      (err, token) => {
        if (err) throw err;
        res.json({ 
          token,
          user: {
            id: user.id,
            walletAddress: user.walletAddress,
            role: user.role,
            name: user.name,
            email: user.email
          }
        });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// @desc    Get current user info
// @route   GET /api/web3/user
// @access  Private
exports.getUserInfo = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// @desc    Link wallet to existing user
// @route   POST /api/web3/link-wallet
// @access  Private
exports.linkWallet = async (req, res) => {
  const { walletAddress, signature } = req.body;

  if (!walletAddress || !signature) {
    return res.status(400).json({ msg: 'Wallet address and signature are required' });
  }

  try {
    // Verify signature using utility function
    const isValid = verifyLinkSignature(walletAddress, signature);

    if (!isValid) {
      return res.status(401).json({ msg: 'Invalid signature' });
    }

    // Check if wallet is already linked to another user
    const existingUser = await User.findOne({ walletAddress });
    if (existingUser && existingUser._id.toString() !== req.user.id) {
      return res.status(400).json({ msg: 'Wallet address already linked to another user' });
    }

    // Update current user with wallet address
    const user = await User.findById(req.user.id);
    user.walletAddress = walletAddress;
    await user.save();

    res.json({ 
      msg: 'Wallet linked successfully',
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        role: user.role,
        name: user.name,
        email: user.email
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};