const jwt = require('jsonwebtoken');
const jwtSecret = process.env.JWT_SECRET || 'supersecretjwttoken';
const User = require('../models/User');
const { verifySignature } = require('../utils/signatureVerification');

// Extract user info from multiple sources
const extractUserInfo = async (req) => {
  let user = null;

  // 1. Try JWT token (primary method)
  const token = req.header('x-auth-token') || req.header('Authorization')?.replace('Bearer ', '');
  
  if (token) {
    try {
      const decoded = jwt.verify(token, jwtSecret);
      user = await User.findById(decoded.user.id).select('-password');
      if (user) {
        return user;
      }
    } catch (err) {
      // Token invalid, continue to fallback methods
    }
  }

  // 2. Try header-based fallback
  const walletAddress = req.header('x-wallet-address');
  const userEmail = req.header('x-user-email');
  const userId = req.header('x-user-id');

  if (walletAddress) {
    user = await User.findOne({ walletAddress }).select('-password');
    if (user) {
      return user;
    }
  }

  if (userEmail) {
    user = await User.findOne({ email: userEmail }).select('-password');
    if (user) {
      return user;
    }
  }

  if (userId) {
    user = await User.findById(userId).select('-password');
    if (user) {
      return user;
    }
  }

  return null;
};

// Main authentication middleware
module.exports = async function (req, res, next) {
  try {
    const user = await extractUserInfo(req);

    if (!user) {
      return res.status(401).json({ 
        msg: 'No valid authentication found',
        error: 'Authentication required'
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ 
      msg: 'Authentication error',
      error: 'Server error during authentication'
    });
  }
};

// Admin authentication middleware
module.exports.admin = async function (req, res, next) {
  try {
    const user = await extractUserInfo(req);

    if (!user) {
      return res.status(401).json({ 
        msg: 'No valid authentication found',
        error: 'Authentication required'
      });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({ 
        msg: 'Access denied',
        error: 'Admin privileges required'
      });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Admin auth middleware error:', err);
    res.status(500).json({ 
      msg: 'Authentication error',
      error: 'Server error during authentication'
    });
  }
};

// Admin or Vendor authentication middleware
module.exports.adminOrVendor = async function (req, res, next) {
  try {
    const user = await extractUserInfo(req);

    if (!user) {
      return res.status(401).json({ 
        errors: [{ msg: 'Authentication required' }]
      });
    }

    if (user.role !== 'admin' && user.role !== 'vendor') {
      return res.status(403).json({ 
        errors: [{ msg: 'Access denied. Admin or vendor privileges required.' }]
      });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Admin/Vendor auth middleware error:', err);
    res.status(500).json({ 
      errors: [{ msg: 'Server error during authentication' }]
    });
  }
};

// Export signature verification helper
module.exports.verifySignature = verifySignature;
