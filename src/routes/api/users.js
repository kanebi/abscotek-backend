/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('config');
const { check, validationResult } = require('express-validator');
const { Resend } = require('resend');
const { v4: uuidv4 } = require('uuid');

const User = require('../../models/User');
const UserVerification = require('../../models/UserVerification');
const logger = require('../../config/logger');

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * @swagger
 * /api/users:
 *   post:
 *     summary: Register user
 *     description: Register a new user.
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *               referralCode:
 *                 type: string
 *                 description: Optional referral code from an existing user.
 *     responses:
 *       200:
 *         description: The JWT token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *       400:
 *         description: Bad request
 *       500:
 *         description: Server error
 */
router.post(
  '/',
  [
    check('name', 'Name is required').not().isEmpty(),
    check('email', 'Please include a valid email').isEmail(),
    check(
      'password',
      'Please enter a password with 6 or more characters'
    ).isLength({ min: 6 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, referralCode } = req.body;

    try {
      let user = await User.findOne({ email });

      if (user) {
        return res.status(400).json({ errors: [{ msg: 'User already exists' }] });
      }

      let referredBy = null;
      if (referralCode) {
        const referral = await Referral.findOne({ referralCode });
        if (referral) {
          referredBy = referral.referrer;
        } else {
          return res.status(400).json({ errors: [{ msg: 'Invalid referral code' }] });
        }
      }

      user = new User({
        name,
        email,
        password,
        referredBy,
      });

      const salt = await bcrypt.genSalt(10);

      user.password = await bcrypt.hash(password, salt);

      await user.save();

      if (referralCode) {
        await Referral.updateOne({ referralCode }, { $set: { referredUser: user._id } });
      }

      // Send email verification
      const uniqueString = uuidv4() + user._id;
      const expiresAt = Date.now() + 21600000; // 6 hours

      const newUserVerification = new UserVerification({
        userId: user._id,
        uniqueString,
        expiresAt,
      });

      await newUserVerification.save();

      const verificationLink = `http://localhost:5832/api/users/verify/${user._id}/${uniqueString}`;

      await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: email,
        subject: 'Verify Your Email',
        html: `<p>Verify your email address to complete the signup and login into your account.</p><p>This link <b>expires in 6 hours</b>.</p><p>Press <a href=${verificationLink}>here</a> to proceed.</p>`,
      });

      logger.info(`Verification email sent to ${email}`);

      const payload = {
        user: {
          id: user.id,
        },
      };

      jwt.sign(
        payload,
        config.get('jwtSecret'),
        { expiresIn: 360000 },
        (err, token) => {
          if (err) throw err;
          res.json({ token });
        }
      );
    } catch (err) {
      logger.error(err.message);
      res.status(500).send('Server error');
    }
  }
);

/**
 * @swagger
 * /api/users/verify/{userId}/{uniqueString}:
 *   get:
 *     summary: Verify user email
 *     description: Verify a user's email address.
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: The user ID.
 *       - in: path
 *         name: uniqueString
 *         schema:
 *           type: string
 *         required: true
 *         description: The unique verification string.
 *     responses:
 *       200:
 *         description: Email verified successfully!
 *       400:
 *         description: Invalid verification link or link expired
 *       500:
 *         description: Server error
 */
router.get('/verify/:userId/:uniqueString', async (req, res) => {
  try {
    const { userId, uniqueString } = req.params;

    const userVerification = await UserVerification.findOne({ userId, uniqueString });

    if (!userVerification) {
      return res.status(400).send('Invalid verification link');
    }

    if (userVerification.expiresAt < Date.now()) {
      await UserVerification.deleteOne({ userId });
      await User.deleteOne({ _id: userId });
      return res.status(400).send('Verification link expired. Please register again.');
    }

    await User.updateOne({ _id: userId }, { $set: { isVerified: true } });
    await UserVerification.deleteOne({ userId });

    res.send('Email verified successfully!');
  } catch (err) {
    logger.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;
