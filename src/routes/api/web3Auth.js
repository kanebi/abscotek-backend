const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const {
  requestSignature,
  verifySignature,
  getUserInfo,
  linkWallet,
} = require('../../controllers/web3AuthController');

// @route   POST api/web3/request-signature
// @desc    Request a message to sign for authentication
// @access  Public
router.post('/request-signature', requestSignature);

// @route   POST api/web3/verify-signature
// @desc    Verify a signed message and authenticate the user
// @access  Public
router.post('/verify-signature', verifySignature);

// @route   GET api/web3/user
// @desc    Get current user info
// @access  Private
router.get('/user', auth, getUserInfo);

// @route   POST api/web3/link-wallet
// @desc    Link wallet to existing user
// @access  Private
router.post('/link-wallet', auth, linkWallet);

module.exports = router;