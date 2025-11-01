const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const { check } = require('express-validator');
const {
  getCart,
  addItemToCart,
  removeItemFromCart,
  getCartByUserId,
  updateItemQuantity,
  clearCart,
} = require('../../controllers/cartController');

/**
 * @swagger
 * tags:
 *   name: Cart
 *   description: Shopping cart management
 */

/**
 * @swagger
 * /api/cart:
 *   get:
 *     summary: Get user cart
 *     description: Retrieve the shopping cart for the authenticated user.
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The user's cart
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                   description: Cart ID
 *                 user:
 *                   type: string
 *                   description: User ID
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CartItem'
 *                 currency:
 *                   type: string
 *                   enum: [USDT, USD, NGN, EUR]
 *                   default: USDT
 *                 subtotal:
 *                   type: number
 *                   description: Cart subtotal
 *                 deliveryFee:
 *                   type: number
 *                   description: Delivery fee
 *                   default: 0
 *                 discount:
 *                   type: number
 *                   description: Discount amount
 *                   default: 0
 *                 total:
 *                   type: number
 *                   description: Total cart amount
 *                 selectedAddress:
 *                   type: string
 *                   description: Selected delivery address ID
 *                 selectedDeliveryMethod:
 *                   type: string
 *                   description: Selected delivery method ID
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/', auth, getCart);

/**
 * @swagger
 * /api/cart/{userId}:
 *   get:
 *     summary: Get user cart by user ID
 *     description: Retrieve the shopping cart for a specific user by their ID.
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the user whose cart to retrieve.
 *     responses:
 *       200:
 *         description: The user's cart
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                   description: Cart ID
 *                 user:
 *                   type: string
 *                   description: User ID
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CartItem'
 *                 currency:
 *                   type: string
 *                   enum: [USDT, USD, NGN, EUR]
 *                   default: USDT
 *                 subtotal:
 *                   type: number
 *                   description: Cart subtotal
 *                 deliveryFee:
 *                   type: number
 *                   description: Delivery fee
 *                   default: 0
 *                 discount:
 *                   type: number
 *                   description: Discount amount
 *                   default: 0
 *                 total:
 *                   type: number
 *                   description: Total cart amount
 *                 selectedAddress:
 *                   type: string
 *                   description: Selected delivery address ID
 *                 selectedDeliveryMethod:
 *                   type: string
 *                   description: Selected delivery method ID
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User or cart not found
 *       500:
 *         description: Server error
 */
router.get('/:userId', auth, getCartByUserId);

/**
 * @swagger
 * /api/cart:
 *   post:
 *     summary: Add item to cart
 *     description: Add a product to the authenticated user's cart.
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - quantity
 *               - currency
 *             properties:
 *               productId:
 *                 type: string
 *                 description: Product ID
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 description: Quantity to add
 *               currency:
 *                 type: string
 *                 enum: [USDT, USD, NGN, EUR]
 *                 description: Currency for the item
 *     responses:
 *       200:
 *         description: The updated cart
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Cart'
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
  [auth, [check('productId', 'Product ID is required').not().isEmpty()]],
  addItemToCart
);

/**
 * @swagger
 * /api/cart:
 *   put:
 *     summary: Update item quantity in cart
 *     description: Update the quantity of a product in the authenticated user's cart.
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - quantity
 *             properties:
 *               productId:
 *                 type: string
 *               quantity:
 *                 type: number
 *     responses:
 *       200:
 *         description: The updated cart
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Cart or item not found
 *       500:
 *         description: Server error
 */
router.put('/', auth, updateItemQuantity);

/**
 * @swagger
 * /api/cart/{userId}/{productId}:
 *   delete:
 *     summary: Remove item from cart
 *     description: Remove a product from a specific user's cart.
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the user whose cart to modify.
 *       - in: path
 *         name: productId
 *         schema:
 *           type: string
 *         required: true
 *         description: The product ID to remove.
 *     responses:
 *       200:
 *         description: The updated cart
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Cart'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Cart or product not found
 *       500:
 *         description: Server error
 */
/**
 * @swagger
 * /api/cart/clear:
 *   delete:
 *     summary: Clear user cart
 *     description: Remove all items from the authenticated user's cart.
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart cleared successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Cart cleared successfully"
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.delete('/clear', auth, clearCart);

router.delete('/:userId/:productId', auth, removeItemFromCart);

module.exports = router;
