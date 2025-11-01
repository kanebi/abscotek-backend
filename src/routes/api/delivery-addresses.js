const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const { check } = require('express-validator');
const {
  createDeliveryAddress,
  getDeliveryAddresses,
  getDeliveryAddressById,
  updateDeliveryAddress,
  deleteDeliveryAddress,
  setDefaultDeliveryAddress,
} = require('../../controllers/deliveryAddressController');

/**
 * @swagger
 * tags:
 *   name: Delivery Addresses
 *   description: Delivery address management
 */

/**
 * @swagger
 * /api/delivery-addresses:
 *   post:
 *     summary: Create a new delivery address
 *     description: Create a new delivery address for the authenticated user.
 *     tags: [Delivery Addresses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - phoneNumber
 *               - streetAddress
 *               - city
 *               - state
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               areaNumber:
 *                 type: string
 *                 default: "+234"
 *               phoneNumber:
 *                 type: string
 *                 pattern: "^[0-9]{7,14}$"
 *               streetAddress:
 *                 type: string
 *               city:
 *                 type: string
 *                 enum: [lagos, abuja, port-harcourt, kano]
 *                 default: lagos
 *               state:
 *                 type: string
 *                 enum: [lagos, fct, rivers, kano]
 *                 default: lagos
 *               country:
 *                 type: string
 *                 default: NG
 *               isDefault:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: The created delivery address
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeliveryAddress'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post(
  '/',
  auth,
  [
    check('firstName', 'First name is required').not().isEmpty(),
    check('lastName', 'Last name is required').not().isEmpty(),
    check('email', 'Please include a valid email').isEmail(),
    check('phoneNumber', 'Phone number is required').matches(/^[0-9]{7,14}$/),
    check('streetAddress', 'Street address is required').not().isEmpty(),
    check('city', 'City is required').not().isEmpty(),
    check('state', 'State is required').not().isEmpty(),
  ],
  createDeliveryAddress
);

/**
 * @swagger
 * /api/delivery-addresses:
 *   get:
 *     summary: Get all delivery addresses
 *     description: Retrieve all delivery addresses for the authenticated user.
 *     tags: [Delivery Addresses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of delivery addresses
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/DeliveryAddress'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/', auth, getDeliveryAddresses);

/**
 * @swagger
 * /api/delivery-addresses/{id}:
 *   get:
 *     summary: Get delivery address by ID
 *     description: Retrieve a single delivery address by its ID.
 *     tags: [Delivery Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The delivery address ID.
 *     responses:
 *       200:
 *         description: The delivery address object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeliveryAddress'
 *       404:
 *         description: Delivery address not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/:id', auth, getDeliveryAddressById);

/**
 * @swagger
 * /api/delivery-addresses/{id}:
 *   put:
 *     summary: Update a delivery address
 *     description: Update an existing delivery address.
 *     tags: [Delivery Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The delivery address ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               areaNumber:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *                 pattern: "^[0-9]{7,14}$"
 *               streetAddress:
 *                 type: string
 *               city:
 *                 type: string
 *                 enum: [lagos, abuja, port-harcourt, kano]
 *               state:
 *                 type: string
 *                 enum: [lagos, fct, rivers, kano]
 *               country:
 *                 type: string
 *               isDefault:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: The updated delivery address
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeliveryAddress'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Delivery address not found
 *       500:
 *         description: Server error
 */
router.put('/:id', auth, updateDeliveryAddress);

/**
 * @swagger
 * /api/delivery-addresses/{id}:
 *   delete:
 *     summary: Delete a delivery address
 *     description: Delete a delivery address by its ID.
 *     tags: [Delivery Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The delivery address ID.
 *     responses:
 *       200:
 *         description: Delivery address removed
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Delivery address not found
 *       500:
 *         description: Server error
 */
router.delete('/:id', auth, deleteDeliveryAddress);

/**
 * @swagger
 * /api/delivery-addresses/{id}/default:
 *   put:
 *     summary: Set default delivery address
 *     description: Set a delivery address as the default for the authenticated user.
 *     tags: [Delivery Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The delivery address ID.
 *     responses:
 *       200:
 *         description: The updated delivery address
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeliveryAddress'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Delivery address not found
 *       500:
 *         description: Server error
 */
router.put('/:id/default', auth, setDefaultDeliveryAddress);

module.exports = router;
