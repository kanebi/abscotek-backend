const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const auth = require('../../middleware/auth');
const {
  createOrder,
  checkoutFromCart,
  handlePaystackWebhook,
  getOrders,
  getOrderById,
  getOrderByNumber,
  updateOrderStatus,
  cancelOrder,
  getOrderByPaystackReference,
  verifyPaymentAndCreateOrder,
  processUSDTWalletPayment,
  createCryptoPaymentOrder,
  checkCryptoPaymentStatus,
} = require('../../controllers/orderController');

/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: Order management
 */

/**
 * @swagger
 * /api/orders:
 *   post:
 *     summary: Create an order
 *     description: Create a new order with specified products, shipping address, and delivery method.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - products
 *               - shippingAddress
 *               - deliveryMethodId
 *               - currency
 *             properties:
 *               products:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required:
 *                     - productId
 *                     - quantity
 *                   properties:
 *                     productId:
 *                       type: string
 *                     quantity:
 *                       type: integer
 *                       minimum: 1
 *               shippingAddress:
 *                 type: string
 *                 description: ID of the shipping address
 *               deliveryMethodId:
 *                 type: string
 *                 description: ID of the delivery method
 *               currency:
 *                 type: string
 *                 enum: [USDT, USD, NGN, EUR]
 *                 description: Order currency
 *               notes:
 *                 type: string
 *                 description: Optional order notes
 *     responses:
 *       200:
 *         description: The created order
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                   description: Order ID
 *                 user:
 *                   type: string
 *                   description: User ID
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/OrderItem'
 *                 shippingAddress:
 *                   type: object
 *                   $ref: '#/components/schemas/DeliveryAddress'
 *                 deliveryMethod:
 *                   type: object
 *                   $ref: '#/components/schemas/DeliveryMethod'
 *                 subtotal:
 *                   type: number
 *                   description: Order subtotal
 *                 deliveryFee:
 *                   type: number
 *                   description: Delivery fee
 *                 discount:
 *                   type: number
 *                   description: Discount amount
 *                   default: 0
 *                 totalAmount:
 *                   type: number
 *                   description: Total order amount
 *                 currency:
 *                   type: string
 *                   enum: [USDT, USD, NGN, EUR]
 *                   description: Order currency
 *                 status:
 *                   type: string
 *                   enum: [pending, paid, processing, shipped, delivered, cancelled, refunded]
 *                   description: Order status
 *                 payment:
 *                   type: object
 *                   $ref: '#/components/schemas/Payment'
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Product not found
 *       500:
 *         description: Server error
 */
router.post(
  '/',
  [
    auth,
    [
      check('products', 'Products array is required').isArray(),
      check('products.*.productId', 'Product ID is required').not().isEmpty(),
      check('products.*.quantity', 'Quantity must be a positive number').isInt({ min: 1 })
    ]
  ],
  createOrder
);

/**
 * @swagger
 * /api/orders/checkout:
 *   post:
 *     summary: Checkout from cart
 *     description: Create an order from the authenticated user's cart and clear the cart.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deliveryMethodId:
 *                 type: string
 *                 description: ID of the delivery method
 *               shippingAddressId:
 *                 type: string
 *                 description: ID of the shipping address
 *               currency:
 *                 type: string
 *                 enum: [USDT, USD, NGN, EUR]
 *                 description: Order currency
 *               notes:
 *                 type: string
 *                 description: Optional order notes
 *     responses:
 *       200:
 *         description: The created order
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                   description: Order ID
 *                 user:
 *                   type: string
 *                   description: User ID
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/OrderItem'
 *                 shippingAddress:
 *                   type: object
 *                   $ref: '#/components/schemas/DeliveryAddress'
 *                 deliveryMethod:
 *                   type: object
 *                   $ref: '#/components/schemas/DeliveryMethod'
 *                 subtotal:
 *                   type: number
 *                   description: Order subtotal
 *                 deliveryFee:
 *                   type: number
 *                   description: Delivery fee
 *                 discount:
 *                   type: number
 *                   description: Discount amount
 *                   default: 0
 *                 totalAmount:
 *                   type: number
 *                   description: Total order amount
 *                 currency:
 *                   type: string
 *                   enum: [USDT, USD, NGN, EUR]
 *                   description: Order currency
 *                 status:
 *                   type: string
 *                   enum: [pending, paid, processing, shipped, delivered, cancelled, refunded]
 *                   description: Order status
 *                 payment:
 *                   type: object
 *                   $ref: '#/components/schemas/Payment'
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Cart or address not found
 *       500:
 *         description: Server error
 */
router.post('/checkout', auth, checkoutFromCart);

/**
 * @swagger
 * /api/orders:
 *   get:
 *     summary: Get all orders for a user
 *     description: Retrieve a list of all orders for the authenticated user with optional category filtering.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [all, to-be-received, completed, cancelled]
 *           default: all
 *         description: Filter orders by category
 *     responses:
 *       200:
 *         description: A list of orders
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Order'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/', auth, getOrders);

/**
 * @swagger
 * /api/orders/paginated:
 *   get:
 *     summary: Get orders with pagination and filtering
 *     description: Retrieve orders for the authenticated user with pagination and status filtering.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of orders per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [all, to-be-received, completed, cancelled]
 *         description: Filter orders by status category
 *     responses:
 *       200:
 *         description: Paginated orders with metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orders:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Order'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     totalOrders:
 *                       type: integer
 *                     hasNextPage:
 *                       type: boolean
 *                     hasPrevPage:
 *                       type: boolean
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/paginated', auth, require('../../controllers/orderController').getOrdersPaginated);

/**
 * @swagger
 * /api/orders/{id}:
 *   get:
 *     summary: Get order by ID
 *     description: Retrieve a specific order by its ID.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     responses:
 *       200:
 *         description: The order
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Order not found
 *       500:
 *         description: Server error
 */
router.get('/:id', auth, getOrderById);
router.get('/by-number/:orderNumber', auth, getOrderByNumber);
router.get('/by-reference/:reference', auth, getOrderByPaystackReference);
router.post('/verify-payment', auth, verifyPaymentAndCreateOrder);
router.post('/usdt-payment', auth, processUSDTWalletPayment);
router.post('/create-crypto-payment', auth, createCryptoPaymentOrder);
router.get('/:orderId/crypto-payment-status', auth, checkCryptoPaymentStatus);

/**
 * @swagger
 * /api/orders/{id}/status:
 *   put:
 *     summary: Update order status
 *     description: Update the status of a specific order.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [Created, Paid, Shipped, Delivered, Cancelled]
 *     responses:
 *       200:
 *         description: Order status updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Order not found
 *       500:
 *         description: Server error
 */
router.put('/:id/status', auth, updateOrderStatus);

/**
 * @swagger
 * /api/orders/{id}/cancel:
 *   post:
 *     summary: Cancel order and request refund
 *     description: Cancel an order and initiate refund process. Only available for orders that haven't been shipped yet.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     responses:
 *       200:
 *         description: Order cancelled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 refundId:
 *                   type: string
 *       400:
 *         description: Order cannot be cancelled
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Order not found
 *       500:
 *         description: Server error
 */
router.post('/:id/cancel', auth, cancelOrder);

// Paystack webhook route (no auth required)
router.post('/paystack/webhook', handlePaystackWebhook);

module.exports = router;
