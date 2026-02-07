const cron = require('node-cron');
const { Order } = require('../models/Order');
const blockchainPaymentService = require('../services/blockchainPaymentService');
const transactionMonitor = require('../services/transactionMonitor');
const Payment = require('../models/Payment');
const Cart = require('../models/Cart');
const User = require('../models/User');
const { awardReferralBonus } = require('../controllers/referralController');
const { reduceStockOnOrder } = require('../utils/stockAnalysis');

/**
 * Payment Verification Job
 * Runs every minute to check for pending crypto payments
 */
const paymentVerificationJob = cron.schedule('* * * * *', async () => {
  try {
    // Get all orders with pending crypto payments
    const pendingOrders = await Order.find({
      paymentMethod: 'crypto',
      paymentStatus: 'unpaid',
      paymentExpiry: { $gt: new Date() }, // Not expired
      paymentAddress: { $exists: true, $ne: null }
    }).populate('buyer');

    if (pendingOrders.length === 0) {
      return; // No pending payments
    }

    console.log(`Checking ${pendingOrders.length} pending crypto payments...`);

    for (const order of pendingOrders) {
      try {
        // Check if payment received
        const paymentReceived = await blockchainPaymentService.checkPaymentReceived(
          order.paymentAddress,
          order.totalAmount,
          order.currency || 'USDC'
        );

        if (paymentReceived) {
          // Get transaction confirmations
          const confirmations = order.paymentTransactionHash
            ? await blockchainPaymentService.getConfirmations(order.paymentTransactionHash)
            : 0;

          // Update confirmations
          order.paymentConfirmations = confirmations;

          // If we have enough confirmations, mark as paid
          const requiredConfirmations = order.requiredConfirmations || 3;
          if (confirmations >= requiredConfirmations) {
            console.log(`Payment confirmed for order ${order._id} with ${confirmations} confirmations`);

            // Update order status
            order.paymentStatus = 'paid';
            order.status = 'confirmed';
            await order.save();

            // Create payment record if not exists
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
                transactionHash: order.paymentTransactionHash
              });
              await payment.save();

              // Update order with payment reference
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

            // Pay from wallet: transfer to platform wallet (user-tied uses buyerId)
            try {
              const buyer = await User.findById(order.buyer._id || order.buyer).select('cryptoPaymentAddress');
              const isUserTied = buyer?.cryptoPaymentAddress && buyer.cryptoPaymentAddress === order.paymentAddress;
              const sweepOptions = isUserTied ? { buyerId: (order.buyer._id || order.buyer).toString() } : {};
              const payResult = await blockchainPaymentService.payFromWallet(order._id.toString(), order.currency, sweepOptions);
              if (payResult.success) {
                order.fundsSwept = true;
                order.fundsSweptAt = new Date();
                order.fundsSweptTxHash = payResult.transactionHash;
                await order.save();
                console.log(`Order ${order._id} funds swept to platform wallet`);
              }
            } catch (sweepErr) {
              console.error(`Order ${order._id} payFromWallet error (sweeper will retry):`, sweepErr.message);
            }

            // Stop monitoring this order
            transactionMonitor.stopMonitoring(order._id.toString());

            console.log(`Order ${order._id} payment confirmed and processed`);
          } else {
            // Payment received but waiting for confirmations
            await order.save();
            console.log(`Order ${order._id} payment received, waiting for confirmations (${confirmations}/${requiredConfirmations})`);
          }
        } else {
          // Check if expired
          if (order.paymentExpiry && new Date() > order.paymentExpiry) {
            console.log(`Order ${order._id} payment expired`);
            order.status = 'cancelled';
            order.paymentStatus = 'failed';
            await order.save();
            transactionMonitor.stopMonitoring(order._id.toString());
          }
        }
      } catch (error) {
        console.error(`Error processing payment for order ${order._id}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in payment verification job:', error);
  }
}, {
  scheduled: false // Don't start automatically
});

module.exports = paymentVerificationJob;
