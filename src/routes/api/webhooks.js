const express = require('express');
const router = express.Router();
const { Order } = require('../../models/Order');
const Payment = require('../../models/Payment');
const Cart = require('../../models/Cart');
const User = require('../../models/User');
const { awardReferralBonus } = require('../../controllers/referralController');
const { reduceStockOnOrder } = require('../../utils/stockAnalysis');
const blockchainPaymentService = require('../../services/blockchainPaymentService');
const { addAlchemyContextToRequest, validateAlchemySignature } = require('../../utils/webhookUtils');

/**
 * Alchemy Webhook Handler
 * Receives instant notifications when payments are detected
 * 
 * Webhook URL: https://your-domain.com/api/webhooks/alchemy
 * 
 * Middleware:
 * - addAlchemyContextToRequest: Stores raw body for signature verification
 * - validateAlchemySignature: Validates X-Alchemy-Signature header
 */
router.post('/alchemy', 
  express.json({ verify: addAlchemyContextToRequest }),
  validateAlchemySignature(process.env.WEBHOOK_SIGNING_KEY || process.env.ALCHEMY_WEBHOOK_SECRET),
  async (req, res) => {
    try {

    // Parse body (may be raw or JSON depending on middleware)
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { event, activity } = body;

    // Handle different event types
    // Handle Alchemy webhook format
    if (event?.type === 'ADDRESS_ACTIVITY' && event.activity) {
      const activities = Array.isArray(event.activity) ? event.activity : [event.activity];
      
      for (const activityItem of activities) {
        await processPaymentActivity(activityItem);
      }
    } else if (activity) {
      // Direct activity object (single or array)
      const activities = Array.isArray(activity) ? activity : [activity];
      for (const activityItem of activities) {
        await processPaymentActivity(activityItem);
      }
    } else if (body.activity) {
      // Alternative format
      const activities = Array.isArray(body.activity) ? body.activity : [body.activity];
      for (const activityItem of activities) {
        await processPaymentActivity(activityItem);
      }
    }

      res.json({ received: true, message: 'Webhook processed successfully' });
    } catch (error) {
      console.error('Alchemy webhook error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Process payment activity from Alchemy webhook
 */
async function processPaymentActivity(activity) {
  try {
    const { fromAddress, toAddress, value, hash, asset, category } = activity;

    // Only process native token transfers (ETH, MATIC, BNB) or USDC
    if (category !== 'external' && category !== 'token') {
      return;
    }

    // Find order with this payment address
    const order = await Order.findOne({
      paymentAddress: toAddress?.toLowerCase(),
      paymentStatus: 'unpaid',
      paymentExpiry: { $gt: new Date() }
    }).populate('buyer');

    if (!order) {
      console.log(`No pending order found for address ${toAddress}`);
      return;
    }

    // Convert value to readable amount
    let receivedAmount = 0;
    if (category === 'external') {
      // Native token (ETH, MATIC, BNB)
      receivedAmount = parseFloat(blockchainPaymentService.weiToAmount(value || '0'));
    } else if (category === 'token' && asset === 'USDC') {
      // USDC token (6 decimals)
      receivedAmount = parseFloat(blockchainPaymentService.weiToAmount(value || '0'));
    }

    // Check if amount matches (allow 0.1% tolerance)
    const expectedAmount = parseFloat(order.totalAmount);
    const tolerance = expectedAmount * 0.001;
    const minAmount = expectedAmount - tolerance;

    if (receivedAmount < minAmount) {
      console.log(`Payment amount mismatch for order ${order._id}: received ${receivedAmount}, expected ${expectedAmount}`);
      return;
    }

    // Verify transaction on-chain
    const confirmations = await blockchainPaymentService.getConfirmations(hash);
    const requiredConfirmations = order.requiredConfirmations || 3;

    if (confirmations < requiredConfirmations) {
      console.log(`Payment for order ${order._id} has ${confirmations} confirmations, waiting for ${requiredConfirmations}`);
      
      // Update order with transaction hash and confirmations
      order.paymentTransactionHash = hash;
      order.paymentConfirmations = confirmations;
      await order.save();
      
      return; // Wait for more confirmations
    }

    // Payment confirmed! Update order
    console.log(`✅ Payment confirmed for order ${order._id} with ${confirmations} confirmations`);

    order.paymentStatus = 'paid';
    order.status = 'confirmed';
    order.paymentTransactionHash = hash;
    order.paymentConfirmations = confirmations;
    await order.save();

    // Create payment record
    const existingPayment = await Payment.findOne({ order: order._id });
    if (!existingPayment) {
      const payment = new Payment({
        order: order._id,
        user: order.buyer._id || order.buyer,
        amount: order.totalAmount,
        currency: order.currency,
        method: 'crypto',
        status: 'completed',
        paymentDate: new Date(),
        transactionHash: hash
      });
      await payment.save();

      order.payments = [payment._id];
      await order.save();
    }

    // Mark cart items as ordered
    const userCart = await Cart.findOne({ user: order.buyer._id || order.buyer });
    if (userCart) {
      userCart.items = userCart.items.map(item => {
        const itemObj = item.toObject ? item.toObject() : item;
        itemObj.status = 'ordered';
        return itemObj;
      });
      await userCart.save();
    }

    // Award referral bonus
    const buyer = await User.findById(order.buyer._id || order.buyer);
    if (buyer && buyer.referredBy) {
      await awardReferralBonus(buyer._id, order.totalAmount);
    }

    // Reduce stock
    await reduceStockOnOrder(order);

    console.log(`Order ${order._id} payment processed successfully`);
  } catch (error) {
    console.error('Error processing payment activity:', error);
    throw error;
  }
}

/**
 * Generic webhook endpoint (for testing or other services)
 */
router.post('/payment', async (req, res) => {
  try {
    const { address, amount, transactionHash, network } = req.body;

    if (!address || !transactionHash) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Find order
    const order = await Order.findOne({
      paymentAddress: address.toLowerCase(),
      paymentStatus: 'unpaid'
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Verify transaction
    const confirmations = await blockchainPaymentService.getConfirmations(transactionHash);
    
    if (confirmations >= (order.requiredConfirmations || 3)) {
      order.paymentStatus = 'paid';
      order.status = 'confirmed';
      order.paymentTransactionHash = transactionHash;
      await order.save();
    }

    res.json({ success: true, confirmations });
  } catch (error) {
    console.error('Payment webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
