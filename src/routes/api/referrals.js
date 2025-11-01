const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const {
  generateReferralLink,
  getReferredUsers,
} = require('../../controllers/referralController');

/**
 * @swagger
 * tags:
 *   name: Referrals
 *   description: Referral program management
 */

/**
 * @swagger
 * /api/referrals/generate:
 *   post:
 *     summary: Generate referral link
 *     description: Generate a unique referral link for the authenticated user.
 *     tags: [Referrals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The generated referral code
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 referralCode:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/generate', auth, generateReferralLink);

/**
 * @swagger
 * /api/referrals/referred-users:
 *   get:
 *     summary: Get referred users
 *     description: Retrieve a list of users referred by the authenticated user.
 *     tags: [Referrals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of referred users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/referred-users', auth, getReferredUsers);

/**
 * @swagger
 * /api/referrals/stats:
 *   get:
 *     summary: Get referral statistics
 *     description: Retrieve referral statistics for the authenticated user.
 *     tags: [Referrals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Referral statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalReferrals:
 *                   type: number
 *                 referralBonus:
 *                   type: number
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/stats', auth, require('../../controllers/referralController').getReferralStats);

/**
 * @swagger
 * /api/referrals/withdraw:
 *   post:
 *     summary: Withdraw referral bonus
 *     description: Withdraw referral bonus to wallet address.
 *     tags: [Referrals]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - walletAddress
 *             properties:
 *               amount:
 *                 type: number
 *               walletAddress:
 *                 type: string
 *     responses:
 *       200:
 *         description: Withdrawal successful
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/withdraw', auth, require('../../controllers/referralController').withdrawBonus);

module.exports = router;
