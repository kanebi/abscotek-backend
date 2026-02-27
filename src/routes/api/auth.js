/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: The user ID.
 *         name:
 *           type: string
 *           description: The user's name.
 *         email:
 *           type: string
 *           description: The user's email.
 *         walletAddress:
 *           type: string
 *           description: The user's wallet address.
 *         role:
 *           type: string
 *           description: The user's role.
 *         date:
 *           type: string
 *           format: date-time
 *           description: The date the user was created.
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const jwtSecret = process.env.JWT_SECRET || 'supersecretjwttoken';
const { check, validationResult } = require('express-validator');
const auth = require('../../middleware/auth');
// Using direct REST API approach instead of PrivyClient

const User = require('../../models/User');

/**
 * @swagger
 * /api/auth:
 *   get:
 *     summary: Get user by token
 *     description: Get user information by providing a valid JWT token.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The user object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password').lean();
    res.json(user);
  } catch (err) {
    console.error('GET /api/auth 500');
    res.status(500).send('Server Error');
  }
});

/**
 * @swagger
 * /api/auth:
 *   post:
 *     summary: Authenticate user & get token
 *     description: Authenticate a user with email and password to get a JWT token.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: The JWT token and user info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid credentials or bad request
 *       500:
 *         description: Server error
 */
router.post(
  '/',
  [
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password is required').exists(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      let user = await User.findOne({ email });

      if (!user) {
        return res.status(400).json({ errors: [{ msg: 'Invalid Credentials' }] });
      }

      const isMatch = await bcrypt.compare(password, user.password);

      if (!isMatch) {
        return res.status(400).json({ errors: [{ msg: 'Invalid Credentials' }] });
      }

      // Update last login
      user.lastLogin = new Date();
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
        { expiresIn: '24h' }, // 24 hour expiry
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
      console.error('POST /api/auth 500');
      res.status(500).send('Server error');
    }
  }
);

/**
 * @swagger
 * /api/auth/privy:
 *   post:
 *     summary: Authenticate user with Privy access token
 *     description: Verify Privy access token and authenticate user.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accessToken
 *             properties:
 *               accessToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: The JWT token and user info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid token or bad request
 *       500:
 *         description: Server error
 */
router.post('/privy', async (req, res) => {
  console.log('POST /api/auth/privy');
  const { accessToken } = req.body;

  if (!accessToken) {
    return res.status(400).json({ errors: [{ msg: 'Access token is required' }] });
  }

  try {
    const frontendOrigin = (process.env.FRONTEND_URL || process.env.PRIVY_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
    const response = await fetch('https://api.privy.io/v1/users/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'privy-app-id': process.env.PRIVY_APP_ID,
        'Content-Type': 'application/json',
        'Origin': frontendOrigin
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Privy API error: ${response.status} - ${errorText}`);
    }
    
    const privyUser = await response.json();
    
    // Extract user info from the API response
    const privyUserData = privyUser.user; // The actual user data is nested under 'user'
    const verifiedClaims = {
      userId: privyUserData.id,
      email: privyUserData.linked_accounts?.find(account => account.type === 'email'),
      phone: privyUserData.linked_accounts?.find(account => account.type === 'phone'),
      wallet: privyUserData.linked_accounts?.find(account => account.type === 'wallet')
    };

    // Extract user info from Privy claims
    const privyUserId = verifiedClaims.userId;
    const walletAddress = verifiedClaims.wallet?.address;
    const email = verifiedClaims.email?.address;
    const name = verifiedClaims.email?.address || verifiedClaims.phone?.number || `User_${privyUserId.slice(0, 8)}`;

    // Find user by Privy ID first
    let user = await User.findOne({ privyUserId });

    if (!user) {
      // Check if user with this email already exists
      const existingUser = await User.findOne({ email });
      
      if (existingUser) {
        // Link Privy account to existing user
        existingUser.privyUserId = privyUserId;
        existingUser.walletAddress = walletAddress || existingUser.walletAddress;
        existingUser.linked = true; // Mark as linked to Privy
        existingUser.lastLogin = new Date();
        await existingUser.save();
        user = existingUser;
      } else {
        // Create new user with Privy data
        user = new User({
          privyUserId,
          walletAddress,
          email,
          name,
          role: 'user',
          linked: true, // Mark as linked to Privy
        });
        await user.save();
      }
    } else {
      // Update existing Privy-linked user with latest data
      if (walletAddress && !user.walletAddress) {
        user.walletAddress = walletAddress;
      }
      if (email && !user.email) {
        user.email = email;
      }
      user.linked = true; // Ensure it's marked as linked
      user.lastLogin = new Date();
      await user.save();
    }

    // Create JWT payload
    const payload = {
      user: {
        id: user.id,
        privyUserId: user.privyUserId,
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
            privyUserId: user.privyUserId,
            email: user.email,
            name: user.name,
            role: user.role,
            walletAddress: user.walletAddress
          }
        });
      }
    );
  } catch (err) {
    console.error('POST /api/auth/privy 401');
    res.status(401).json({ 
      errors: [{ 
        msg: 'Invalid access token',
        details: err.message 
      }] 
    });
  }
});

module.exports = router;
