const { Order } = require('../models/Order');
const blockchainPaymentService = require('../services/blockchainPaymentService');
const transactionMonitor = require('../services/transactionMonitor');
const Payment = require('../models/Payment');
const Cart = require('../models/Cart');
const User = require('../models/User');
const { awardReferralBonus } = require('../controllers/referralController');
const { reduceStockOnOrder } = require('../utils/stockAnalysis');

const RUN_INTERVAL_MS = 30 * 1000; // 30 seconds

/**
 * Mark order as paid and run all side effects (Payment record, cart, referral, stock, stop monitoring).
 * Called when payment is confirmed on-chain (amount or more in wallet). Sweeping is done separately by fundSweeperJob.
 * Also used by POST /api/orders/:orderId/confirm-crypto-payment after manual confirm.
 */
async function markOrderPaidAndComplete(order) {
  order.paymentStatus = 'paid';
  order.status = 'confirmed';
  await order.save();

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
      transactionHash: order.paymentTransactionHash || order.fundsSweptTxHash
    });
    await payment.save();
    order.payments = [payment._id];
    await order.save();
  }

  const userCart = await Cart.findOne({ user: order.buyer._id || order.buyer });
  if (userCart) {
    userCart.items = userCart.items.map(item => {
      const itemObj = item.toObject ? item.toObject() : item;
      itemObj.status = 'ordered';
      return itemObj;
    });
    await userCart.save();
  }

  const buyer = await User.findById(order.buyer._id || order.buyer);
  if (buyer && buyer.referredBy) {
    await awardReferralBonus(buyer._id, order.totalAmount);
  }

  await reduceStockOnOrder(order);
  transactionMonitor.stopMonitoring(order._id.toString());

  try {
    const { sendOrderConfirmationEmail } = require('../email');
    await sendOrderConfirmationEmail(order);
  } catch (e) {
    console.error('[PaymentVerification] Order confirmation email failed:', e.message);
  }
}

/**
 * Single run of payment verification (shared by cron and by confirmCryptoPayment flow).
 * - Cancel order when unpaid and past expiry.
 * - When payment found on-chain (amount or more in wallet): store tx hash, confirm order (mark paid). Does NOT sweep; sweeper job handles that.
 */
async function runPaymentVerification() {
  try {
    console.log(`[PaymentVerification] Run at ${new Date().toISOString()}`);

    const pendingOrders = await Order.find({
      paymentMethod: 'crypto',
      paymentStatus: 'unpaid',
      paymentAddress: { $exists: true, $ne: null }
    }).populate('buyer');

    if (pendingOrders.length === 0) {
      console.log('[PaymentVerification] No pending crypto payments found.');
      return;
    }

    console.log(`[PaymentVerification] Checking ${pendingOrders.length} pending crypto payments...`);

    for (const order of pendingOrders) {
      try {
        if (order.currency === 'USDT') {
          order.currency = 'USDC';
        }
        const orderCurrency = order.currency || 'USDC';

        const paymentReceived = await blockchainPaymentService.checkPaymentReceived(
          order.paymentAddress,
          order.totalAmount,
          orderCurrency
        );

        if (paymentReceived) {
          if (!order.paymentTransactionHash) {
            const txHash = await blockchainPaymentService.getIncomingUSDCTransferTxHash(
              order.paymentAddress,
              Number(order.totalAmount)
            );
            if (txHash) {
              order.paymentTransactionHash = txHash;
              await order.save();
              console.log(`[PaymentVerification] Stored payment tx hash for order ${order._id}: ${txHash}`);
            }
          }

          await markOrderPaidAndComplete(order);
          console.log(`[PaymentVerification] Order ${order._id} confirmed (sweep will run via sweeper job)`);
        } else {
          // No payment found: cancel if past expiry
          if (order.paymentExpiry && new Date() > order.paymentExpiry) {
            console.log(`[PaymentVerification] Order ${order._id} unpaid and past expiry – cancelling`);
            order.status = 'cancelled';
            order.paymentStatus = 'failed';
            try {
              await order.save();
            } catch (saveErr) {
              console.error(`Error saving expired order ${order._id}:`, saveErr);
            }
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
}

let intervalId = null;

const paymentVerificationJob = {
  start() {
    if (intervalId) return;
    runPaymentVerification();
    intervalId = setInterval(runPaymentVerification, RUN_INTERVAL_MS);
  },
  stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }
};

module.exports = paymentVerificationJob;
module.exports.runPaymentVerification = runPaymentVerification;
module.exports.markOrderPaidAndComplete = markOrderPaidAndComplete;
