const cron = require('node-cron');
const { Order } = require('../models/Order');
const User = require('../models/User');
const blockchainPaymentService = require('../services/blockchainPaymentService');

/**
 * Fund Sweeper Job
 * Runs every 2 minutes to sweep funds from payment addresses to main wallet
 */
const fundSweeperJob = cron.schedule('*/2 * * * *', async () => {
  try {
    // Get main wallet address from environment
    const mainWalletAddress = process.env.MAIN_WALLET_ADDRESS;
    
    if (!mainWalletAddress) {
      console.warn('MAIN_WALLET_ADDRESS not set in environment. Skipping fund sweep.');
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
      return; // No orders to sweep
    }

    console.log(`Found ${ordersToSweep.length} orders to sweep funds from...`);

    for (const order of ordersToSweep) {
      try {
        const orderId = order._id.toString();
        const currency = order.currency || 'USDT';
        
        // Determine if we need to sweep USDT token or native token
        const isUSDT = currency === 'USDT';
        
        if (isUSDT) {
          // Sweep USDT token
          const usdtBalance = await blockchainPaymentService.getUSDTBalance(order.paymentAddress);
          const usdtBalanceRaw = await blockchainPaymentService.getUSDTBalanceRaw(order.paymentAddress);

          if (usdtBalanceRaw === 0n) {
            // No USDT, check if we should mark as swept
            // Also check native balance for gas
            const nativeBalance = await blockchainPaymentService.getBalanceWei(order.paymentAddress);
            if (nativeBalance === 0n) {
              order.fundsSwept = true;
              await order.save();
              console.log(`Order ${orderId}: No USDT or native token to sweep`);
              continue;
            }
          }

          console.log(`Order ${orderId}: Sweeping ${usdtBalance} USDT from ${order.paymentAddress}...`);

          // Use user-tied sweep if order uses user's cryptoPaymentAddress
          const buyer = await User.findById(order.buyer).select('cryptoPaymentAddress');
          const isUserTied = buyer?.cryptoPaymentAddress && buyer.cryptoPaymentAddress === order.paymentAddress;
          const sweepOptions = isUserTied ? { buyerId: order.buyer.toString() } : {};
          const result = await blockchainPaymentService.payFromWallet(orderId, 'USDT', sweepOptions);

          if (result.success) {
            // Mark as swept
            order.fundsSwept = true;
            order.fundsSweptAt = new Date();
            order.fundsSweptTxHash = result.transactionHash;
            await order.save();

            console.log(`Order ${orderId}: Successfully swept ${result.amount} USDT`);
            console.log(`Transaction: ${result.transactionHash}`);
          } else {
            console.log(`Order ${orderId}: ${result.message}`);
            if (result.message && result.message.includes('Insufficient native token')) {
              // Can't sweep USDT due to lack of gas, but keep trying
              // Don't mark as swept yet - might get native token later for gas
              console.log(`Order ${orderId}: Waiting for native token to cover gas fees`);
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
            console.log(`Order ${orderId}: No native token to sweep`);
            continue;
          }

          console.log(`Order ${orderId}: Sweeping ${balance} ${currency} (native) from ${order.paymentAddress}...`);

          const buyer = await User.findById(order.buyer).select('cryptoPaymentAddress');
          const isUserTied = buyer?.cryptoPaymentAddress && buyer.cryptoPaymentAddress === order.paymentAddress;
          const sweepOptions = isUserTied ? { buyerId: order.buyer.toString() } : {};
          const result = await blockchainPaymentService.payFromWallet(orderId, currency, sweepOptions);

          if (result.success) {
            // Mark as swept
            order.fundsSwept = true;
            order.fundsSweptAt = new Date();
            order.fundsSweptTxHash = result.transactionHash;
            await order.save();

            console.log(`Order ${orderId}: Successfully swept ${result.amount} ${currency}`);
            console.log(`Transaction: ${result.transactionHash}`);
          } else {
            console.log(`Order ${orderId}: ${result.message}`);
            if (result.message === 'Insufficient funds to cover gas fees') {
              // Mark as swept if insufficient for gas (likely dust)
              order.fundsSwept = true;
              order.fundsSweptNote = result.message;
              await order.save();
            }
          }
        }
      } catch (error) {
        console.error(`Error sweeping funds for order ${order._id}:`, error);
        
        // If it's a known error (like already swept), mark it
        if (error.message && error.message.includes('already been swept')) {
          order.fundsSwept = true;
          await order.save();
        }
      }
    }
  } catch (error) {
    console.error('Error in fund sweeper job:', error);
  }
}, {
  scheduled: false // Don't start automatically
});

module.exports = fundSweeperJob;
