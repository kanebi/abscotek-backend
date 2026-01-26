const { ethers } = require('ethers');
const blockchainPaymentService = require('./blockchainPaymentService');

/**
 * Transaction Monitor Service
 * Monitors blockchain for incoming payments
 */
class TransactionMonitor {
  constructor() {
    this.monitoredAddresses = new Map(); // orderId -> { address, expectedAmount, startTime, callback }
    this.isMonitoring = false;
    this.monitoringInterval = null;
    this.blockListener = null;
  }

  get provider() {
    return blockchainPaymentService.provider;
  }

  /**
   * Start monitoring an address for payment
   */
  startMonitoring(orderId, address, expectedAmount, callback = null) {
    this.monitoredAddresses.set(orderId, {
      address,
      expectedAmount: parseFloat(expectedAmount),
      startTime: Date.now(),
      callback
    });

    // Start global monitoring if not already started
    if (!this.isMonitoring) {
      this.startGlobalMonitoring();
    }

    console.log(`Started monitoring address ${address} for order ${orderId}, expected: ${expectedAmount}`);
  }

  /**
   * Stop monitoring an address
   */
  stopMonitoring(orderId) {
    const removed = this.monitoredAddresses.delete(orderId);
    if (removed) {
      console.log(`Stopped monitoring order ${orderId}`);
    }

    // Stop global monitoring if no addresses to monitor
    if (this.monitoredAddresses.size === 0) {
      this.stopGlobalMonitoring();
    }
  }

  /**
   * Start global monitoring (polling + event listeners)
   */
  startGlobalMonitoring() {
    if (this.isMonitoring) return;

    this.isMonitoring = true;

    // Method 1: Polling (every 15 seconds)
    this.monitoringInterval = setInterval(async () => {
      await this.checkAllPayments();
    }, 15000);

    // Method 2: Block listener (real-time)
    this.blockListener = (blockNumber) => {
      this.checkBlockForPayments(blockNumber).catch(err => {
        console.error('Error checking block for payments:', err);
      });
    };

    this.provider.on('block', this.blockListener);

    console.log('Started global payment monitoring');
  }

  /**
   * Stop global monitoring
   */
  stopGlobalMonitoring() {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.blockListener) {
      this.provider.off('block', this.blockListener);
      this.blockListener = null;
    }

    console.log('Stopped global payment monitoring');
  }

  /**
   * Check all monitored addresses for payments
   */
  async checkAllPayments() {
    if (this.monitoredAddresses.size === 0) return;

    const promises = Array.from(this.monitoredAddresses.entries()).map(
      async ([orderId, { address, expectedAmount, callback }]) => {
        try {
          const paymentReceived = await blockchainPaymentService.checkPaymentReceived(
            address,
            expectedAmount
          );

          if (paymentReceived) {
            console.log(`Payment received for order ${orderId}`);
            
            // Call callback if provided
            if (callback) {
              callback(orderId, address, expectedAmount);
            }

            // Return orderId for removal
            return orderId;
          }
        } catch (error) {
          console.error(`Error checking payment for order ${orderId}:`, error);
        }
        return null;
      }
    );

    const completedOrders = (await Promise.all(promises)).filter(id => id !== null);

    // Remove completed orders from monitoring
    completedOrders.forEach(orderId => {
      this.stopMonitoring(orderId);
    });
  }

  /**
   * Check a specific block for payments
   */
  async checkBlockForPayments(blockNumber) {
    if (this.monitoredAddresses.size === 0) return;

    try {
      const block = await this.provider.getBlock(blockNumber, true);
      if (!block || !block.transactions) return;

      // Check each transaction in the block
      for (const tx of block.transactions) {
        if (!tx.to) continue;

        // Check if this transaction is to any monitored address
        for (const [orderId, { address, expectedAmount, callback }] of this.monitoredAddresses.entries()) {
          if (tx.to.toLowerCase() === address.toLowerCase()) {
            // Verify amount matches
            const txValue = ethers.formatEther(tx.value);
            const expectedValue = expectedAmount.toString();

            // Allow small tolerance (0.1%)
            const tolerance = expectedAmount * 0.001;
            if (Math.abs(parseFloat(txValue) - expectedAmount) <= tolerance) {
              console.log(`Payment detected in block ${blockNumber} for order ${orderId}`);

              // Wait for confirmations before confirming
              setTimeout(async () => {
                const confirmations = await blockchainPaymentService.getConfirmations(tx.hash);
                if (confirmations >= 3) {
                  if (callback) {
                    callback(orderId, address, expectedAmount, tx.hash);
                  }
                  this.stopMonitoring(orderId);
                }
              }, 30000); // Wait 30 seconds for confirmations
            }
          }
        }
      }
    } catch (error) {
      console.error('Error checking block for payments:', error);
    }
  }

  /**
   * Verify a transaction on-chain
   */
  async verifyTransaction(txHash, expectedAmount, recipientAddress) {
    try {
      const { tx, receipt } = await blockchainPaymentService.getTransaction(txHash);

      if (!tx || !receipt) {
        return { valid: false, reason: 'Transaction not found' };
      }

      // Check recipient
      if (tx.to.toLowerCase() !== recipientAddress.toLowerCase()) {
        return { valid: false, reason: 'Recipient address mismatch' };
      }

      // Check amount (allow 0.1% tolerance)
      const txValue = ethers.formatEther(tx.value);
      const expectedValue = parseFloat(expectedAmount);
      const tolerance = expectedValue * 0.001;

      if (Math.abs(parseFloat(txValue) - expectedValue) > tolerance) {
        return { valid: false, reason: 'Amount mismatch' };
      }

      // Check confirmations
      const confirmations = await blockchainPaymentService.getConfirmations(txHash);
      if (confirmations < 3) {
        return { valid: false, reason: 'Insufficient confirmations', confirmations };
      }

      // Check transaction status
      if (receipt.status !== 1) {
        return { valid: false, reason: 'Transaction failed' };
      }

      return {
        valid: true,
        txHash,
        amount: txValue,
        confirmations,
        blockNumber: receipt.blockNumber
      };
    } catch (error) {
      console.error('Error verifying transaction:', error);
      return { valid: false, reason: error.message };
    }
  }

  /**
   * Get monitoring status
   */
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      monitoredCount: this.monitoredAddresses.size,
      addresses: Array.from(this.monitoredAddresses.keys())
    };
  }
}

module.exports = new TransactionMonitor();
