const cron = require('node-cron');
const { Order } = require('../models/Order');
const User = require('../models/User');
const blockchainPaymentService = require('../services/blockchainPaymentService');

/**
 * Fund Sweeper Job
 * Runs every 3 minutes. Sweeps paid crypto orders (payment verification confirms first; this job does the actual sweep with gas funding).
 */
const fundSweeperJob = cron.schedule('*/3 * * * *', async () => {
  const runAt = new Date().toISOString();
  console.log(`[FundSweeper] Cron run at ${runAt}`);
  try {
    // Get main wallet address from environment
    const mainWalletAddress = process.env.MAIN_WALLET_ADDRESS;
    
    if (!mainWalletAddress) {
      console.warn('[FundSweeper] MAIN_WALLET_ADDRESS not set in environment. Skipping fund sweep.');
      return;
    }

    // Get all orders with confirmed crypto payments that haven't been swept
    const ordersToSweep = await Order.find({
      paymentMethod: 'crypto',
      paymentStatus: 'paid',
      paymentAddress: { $exists: true, $ne: null },
      fundsSwept: { $ne: true } // Only sweep once
    }).select('_id buyer paymentAddress totalAmount currency');

    if (ordersToSweep.length === 0) {
      console.log('[FundSweeper] No orders to sweep.');
      return;
    }

    console.log(`[FundSweeper] Found ${ordersToSweep.length} order(s) to sweep`);

    for (const order of ordersToSweep) {
      try {
        const orderId = order._id.toString();
        const currency = order.currency || 'USDC';
        
        // Determine if we need to sweep stablecoin token or native token
        const isStablecoin = currency === 'USDC' || currency === 'USD';
        
        if (isStablecoin) {
          const tokenBalance = await blockchainPaymentService.getUSDCBalance(order.paymentAddress);
          const tokenBalanceRaw = await blockchainPaymentService.getUSDCBalanceRaw(order.paymentAddress);

          if (tokenBalanceRaw === 0n) {
            const nativeBalance = await blockchainPaymentService.getBalanceWei(order.paymentAddress);
            if (nativeBalance === 0n) {
              order.fundsSwept = true;
              await order.save();
              console.log(`[FundSweeper] Order ${orderId}: No USDC or native token to sweep`);
              continue;
            }
          }

          console.log(`[FundSweeper] Order ${orderId}: Sweeping ${tokenBalance} USDC from ${order.paymentAddress}...`);

          // Orders always use user-tied payment addresses (generatePaymentAddressForUser), so always pass buyerId for sweep
          const buyerId = (order.buyer._id || order.buyer).toString();
          const sweepOptions = { buyerId };
          const result = await blockchainPaymentService.payFromWallet(orderId, currency, sweepOptions);

          if (result.success) {
            order.fundsSwept = true;
            order.fundsSweptAt = new Date();
            order.fundsSweptTxHash = result.transactionHash;
            await order.save();

            console.log(`[FundSweeper] Order ${orderId}: Successfully swept ${result.amount} USDC. Tx: ${result.transactionHash}`);
          } else {
            console.log(`[FundSweeper] Order ${orderId}: ${result.message}`);
            if (result.message && result.message.includes('Insufficient native token')) {
              // Don't mark as swept yet - might get native token later for gas
              console.log(`[FundSweeper] Order ${orderId}: Waiting for native token to cover gas fees`);
            } else {
              // Other error, mark as swept
              order.fundsSwept = true;
              order.fundsSweptNote = result.message;
              await order.save();
            }
          }
        } else {
          // Sweep native token (ETH, MATIC, BNB)
          const balance = await blockchainPaymentService.getBalance(order.paymentAddress);
          const balanceWei = await blockchainPaymentService.getBalanceWei(order.paymentAddress);

          if (balanceWei === 0n) {
            // No funds, mark as swept to avoid checking again
            order.fundsSwept = true;
            await order.save();
            console.log(`[FundSweeper] Order ${orderId}: No native token to sweep`);
            continue;
          }

          console.log(`[FundSweeper] Order ${orderId}: Sweeping ${balance} ${currency} (native) from ${order.paymentAddress}...`);

          const buyerId = (order.buyer._id || order.buyer).toString();
          const sweepOptions = { buyerId };
          const result = await blockchainPaymentService.payFromWallet(orderId, currency, sweepOptions);

          if (result.success) {
            // Mark as swept
            order.fundsSwept = true;
            order.fundsSweptAt = new Date();
            order.fundsSweptTxHash = result.transactionHash;
            await order.save();

            console.log(`[FundSweeper] Order ${orderId}: Successfully swept ${result.amount} ${currency}. Tx: ${result.transactionHash}`);
          } else {
            console.log(`[FundSweeper] Order ${orderId}: ${result.message}`);
            if (result.message === 'Insufficient funds to cover gas fees') {
              // Mark as swept if insufficient for gas (likely dust)
              order.fundsSwept = true;
              order.fundsSweptNote = result.message;
              await order.save();
            }
          }
        }
      } catch (error) {
        console.error(`[FundSweeper] Error sweeping order ${order._id}:`, error.message);
        
        // If it's a known error (like already swept), mark it
        if (error.message && error.message.includes('already been swept')) {
          order.fundsSwept = true;
          await order.save();
        }
      }
    }
    console.log(`[FundSweeper] Cron run finished at ${new Date().toISOString()}`);
  } catch (error) {
    console.error('[FundSweeper] Job error:', error);
  }
}, {
  scheduled: false // Don't start automatically
});

module.exports = fundSweeperJob;
