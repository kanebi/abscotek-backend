const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const { check } = require('express-validator');
const {
  adminListOrders,
  adminGetOrderById,
  adminUpdateOrder,
} = require('../../controllers/orderController');

/**
 * @swagger
 * tags:
 *   name: Admin Orders
 *   description: Admin order management
 */

/**
 * @swagger
 * /api/admin/orders:
 *   get:
 *     summary: List all orders
 *     tags: [Admin Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of orders
 */
router.get('/orders', auth.admin, adminListOrders);

/**
 * @swagger
 * /api/admin/orders/{id}:
 *   get:
 *     summary: Get order by id
 *     tags: [Admin Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Order details
 */
router.get('/orders/:id', auth.admin, adminGetOrderById);

/**
 * @swagger
 * /api/admin/orders/{id}:
 *   put:
 *     summary: Update order
 *     tags: [Admin Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [Created, Paid, Shipped, Delivered, Cancelled]
 *               trackingNumber:
 *                 type: string
 *               deliveryMethodId:
 *                 type: string
 *               shippingAddress:
 *                 type: object
 *     responses:
 *       200:
 *         description: Updated order
 */
router.put('/orders/:id', auth.admin, adminUpdateOrder);

module.exports = router;

