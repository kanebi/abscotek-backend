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

module.exports = router;
