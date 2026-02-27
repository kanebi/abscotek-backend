const jwt = require('jsonwebtoken');
const jwtSecret = process.env.JWT_SECRET || 'supersecretjwttoken';
const User = require('../models/User');
const { verifySignature } = require('../utils/signatureVerification');
// Removed @privy-io/server-auth import - using direct REST API approach

// Extract user info from multiple sources
const extractUserInfo = async (req) => {
  let user = null;

  // 1. Try JWT token (primary method) - could be local or Privy
  const token = req.header('x-auth-token') || req.header('Authorization')?.replace('Bearer ', '');

  if (token) {
    // First try local JWT verification
    try {
      const decoded = jwt.verify(token, jwtSecret);
      user = await User.findById(decoded.user.id).select('-password');
      if (user) {
        return user;
      }
    } catch (err) {
      // Not a local JWT, try Privy JWT verification using direct REST API (Origin required by Privy)
      try {
        const frontendOrigin = (process.env.FRONTEND_URL || process.env.PRIVY_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
        const response = await fetch('https://api.privy.io/v1/users/me', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'privy-app-id': process.env.PRIVY_APP_ID,
            'Content-Type': 'application/json',
            'Origin': frontendOrigin
          }
        });

        if (response.ok) {
          const privyUser = await response.json();
          const privyUserData = privyUser.user;
          const privyUserId = privyUserData.id;
          
          // Find user by Privy user ID
          user = await User.findOne({ privyUserId }).select('-password');
          if (user) {
            return user;
          }
        }
      } catch (privyErr) {
        // Neither local nor Privy JWT, continue to fallback methods
      }
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

// Optional auth: set req.user when token valid, never 401
const optionalAuth = async function (req, res, next) {
  try {
    const user = await extractUserInfo(req);
    if (user) req.user = user;
    next();
  } catch (err) {
    next();
  }
};

// Main authentication middleware
const auth = async function (req, res, next) {
  try {
    console.log(`${req.method} ${req.originalUrl || req.path}`);
    const user = await extractUserInfo(req);

    if (!user) {
      return res.status(401).json({ 
        msg: 'No valid authentication found',
        error: 'Authentication required'
      });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error(`${req.method} ${req.originalUrl || req.path} 500`);
    res.status(500).json({ 
      msg: 'Authentication error',
      error: 'Server error during authentication'
    });
  }
};

auth.optional = optionalAuth;

module.exports = auth;

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
    console.error(`${req.method} ${req.originalUrl || req.path} 500`);
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
    console.error(`${req.method} ${req.originalUrl || req.path} 500`);
    res.status(500).json({ 
      errors: [{ msg: 'Server error during authentication' }]
    });
  }
};

// Export signature verification helper
module.exports.verifySignature = verifySignature;
