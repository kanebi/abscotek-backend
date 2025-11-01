const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const { check } = require('express-validator');
const {
  createDeliveryMethod,
  getDeliveryMethods,
  getDeliveryMethodById,
  updateDeliveryMethod,
  deleteDeliveryMethod,
  syncDeliveryMethods,
} = require('../../controllers/deliveryMethodController');

/**
 * @swagger
 * tags:
 *   name: Delivery Methods
 *   description: Delivery method management
 */

/**
 * @swagger
 * /api/delivery-methods:
 *   post:
 *     summary: Create a delivery method
 *     description: Create a new delivery method (admin only).
 *     tags: [Delivery Methods]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - price
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               estimatedDeliveryTime:
 *                 type: string
 *     responses:
 *       200:
 *         description: The created delivery method
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeliveryMethod'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post(
  '/',
  [auth, [check('name', 'Name is required').not().isEmpty(), check('price', 'Price is required').isNumeric()]],
  createDeliveryMethod
);

/**
 * @swagger
 * /api/delivery-methods:
 *   get:
 *     summary: Get all delivery methods
 *     description: Retrieve a list of all delivery methods.
 *     tags: [Delivery Methods]
 *     responses:
 *       200:
 *         description: A list of delivery methods
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/DeliveryMethod'
 *       500:
 *         description: Server error
 */
router.get('/', getDeliveryMethods);

/**
 * @swagger
 * /api/delivery-methods/sync:
 *   post:
 *     summary: Sync frontend delivery methods with backend
 *     description: Get or create delivery methods based on frontend configuration.
 *     tags: [Delivery Methods]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - frontendMethods
 *             properties:
 *               frontendMethods:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     price:
 *                       type: number
 *                     currency:
 *                       type: string
 *     responses:
 *       200:
 *         description: Synced delivery methods with backend IDs
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   price:
 *                     type: number
 *                   currency:
 *                     type: string
 *       400:
 *         description: Bad request
 *       500:
 *         description: Server error
 */
router.post('/sync', syncDeliveryMethods);

/**
 * @swagger
 * /api/delivery-methods/{id}:
 *   get:
 *     summary: Get delivery method by ID
 *     description: Retrieve a single delivery method by its ID.
 *     tags: [Delivery Methods]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The delivery method ID.
 *     responses:
 *       200:
 *         description: The delivery method object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeliveryMethod'
 *       404:
 *         description: Delivery method not found
 *       500:
 *         description: Server error
 */
router.get('/:id', getDeliveryMethodById);

/**
 * @swagger
 * /api/delivery-methods/{id}:
 *   put:
 *     summary: Update a delivery method
 *     description: Update an existing delivery method (admin only).
 *     tags: [Delivery Methods]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The delivery method ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               estimatedDeliveryTime:
 *                 type: string
 *     responses:
 *       200:
 *         description: The updated delivery method
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeliveryMethod'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Delivery method not found
 *       500:
 *         description: Server error
 */
router.put('/:id', auth, updateDeliveryMethod);

/**
 * @swagger
 * /api/delivery-methods/{id}:
 *   delete:
 *     summary: Delete a delivery method
 *     description: Delete a delivery method by its ID (admin only).
 *     tags: [Delivery Methods]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The delivery method ID.
 *     responses:
 *       200:
 *         description: Delivery method removed
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Delivery method not found
 *       500:
 *         description: Server error
 */
router.delete('/:id', auth, deleteDeliveryMethod);

module.exports = router;
