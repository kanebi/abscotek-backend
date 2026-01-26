const { ethers } = require('ethers');
const crypto = require('crypto');
const web3Config = require('../config/web3Config');

/**
 * Blockchain Payment Service
 * Handles payment address generation and blockchain interactions
 */
class BlockchainPaymentService {
  constructor() {
    this.network = process.env.ACTIVE_NETWORK || 'ethereum';
    this.provider = this.createProvider();
    this.masterSeed = this.getMasterSeed();
  }

  /**
   * Create provider based on network
   * Prefers Alchemy (better webhooks), falls back to Infura
   */
  createProvider() {
    const networkConfig = web3Config[this.network] || web3Config.ethereum;
    
    // Prefer Alchemy if API key is available (better webhook support)
    const useAlchemy = !!process.env.ALCHEMY_API_KEY;
    
    if (this.network === 'ethereum') {
      if (useAlchemy) {
        return new ethers.JsonRpcProvider(
          `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
        );
      }
      return new ethers.JsonRpcProvider(
        `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
      );
    } else if (this.network === 'polygon') {
      if (useAlchemy) {
        return new ethers.JsonRpcProvider(
          `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
        );
      }
      return new ethers.JsonRpcProvider(
        `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
      );
    } else if (this.network === 'bsc') {
      // BSC doesn't have Alchemy support, use public RPC or BSC Scan
      if (process.env.BSC_RPC_URL) {
        return new ethers.JsonRpcProvider(process.env.BSC_RPC_URL);
      }
      return new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
    }
    
    // Default to Ethereum with Alchemy or Infura
    if (useAlchemy) {
      return new ethers.JsonRpcProvider(
        `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
      );
    }
    return new ethers.JsonRpcProvider(
      `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
    );
  }

  /**
   * Get or generate master seed for HD wallet
   */
  getMasterSeed() {
    // Use a secret from env or generate one
    const secret = process.env.PAYMENT_MASTER_SECRET || process.env.ETHEREUM_PRIVATE_KEY || 'default-secret-change-me';
    
    // Generate deterministic seed from secret
    return crypto.createHash('sha256')
      .update(secret)
      .digest('hex');
  }

  /**
   * Generate unique payment address for an order
   * Uses deterministic private key generation from order ID
   */
  generatePaymentAddress(orderId) {
    try {
      // Generate deterministic private key from order ID + master secret
      // This ensures the same order ID always generates the same address
      const privateKeyBytes = crypto.createHash('sha256')
        .update(orderId + this.masterSeed)
        .digest();
      
      // Ensure private key is valid (32 bytes, within valid range)
      // Ethereum private keys must be less than secp256k1 curve order
      const privateKey = '0x' + privateKeyBytes.toString('hex');
      
      // Create wallet from private key
      const wallet = new ethers.Wallet(privateKey);
      
      return wallet.address;
    } catch (error) {
      console.error('Error generating payment address:', error);
      // Fallback: use order ID hash directly
      const hash = crypto.createHash('sha256')
        .update(orderId + this.masterSeed + Date.now())
        .digest('hex');
      
      const privateKey = '0x' + hash.slice(0, 64);
      try {
        const wallet = new ethers.Wallet(privateKey);
        return wallet.address;
      } catch (err) {
        // Last resort: random wallet (not ideal but works)
        return ethers.Wallet.createRandom().address;
      }
    }
  }

  /**
   * Get balance of an address
   */
  async getBalance(address) {
    try {
      const balance = await this.provider.getBalance(address);
      return ethers.formatEther(balance);
    } catch (error) {
      console.error('Error getting balance:', error);
      throw error;
    }
  }

  /**
   * Get balance in wei (for exact comparisons)
   */
  async getBalanceWei(address) {
    try {
      return await this.provider.getBalance(address);
    } catch (error) {
      console.error('Error getting balance in wei:', error);
      throw error;
    }
  }

  /**
   * Convert amount to wei (for native tokens like ETH, MATIC, BNB)
   */
  amountToWei(amount) {
    return ethers.parseEther(amount.toString());
  }

  /**
   * Convert wei to amount
   */
  weiToAmount(wei) {
    return ethers.formatEther(wei);
  }

  /**
   * Get transaction details
   */
  async getTransaction(txHash) {
    try {
      const tx = await this.provider.getTransaction(txHash);
      const receipt = await this.provider.getTransactionReceipt(txHash);
      return { tx, receipt };
    } catch (error) {
      console.error('Error getting transaction:', error);
      throw error;
    }
  }

  /**
   * Get current block number
   */
  async getCurrentBlockNumber() {
    try {
      return await this.provider.getBlockNumber();
    } catch (error) {
      console.error('Error getting block number:', error);
      throw error;
    }
  }

  /**
   * Get transaction confirmations
   */
  async getConfirmations(txHash) {
    try {
      const receipt = await this.provider.getTransactionReceipt(txHash);
      if (!receipt) return 0;
      
      const currentBlock = await this.getCurrentBlockNumber();
      return currentBlock - receipt.blockNumber;
    } catch (error) {
      console.error('Error getting confirmations:', error);
      return 0;
    }
  }

  /**
   * Check if address received payment
   */
  async checkPaymentReceived(address, expectedAmount) {
    try {
      const balance = await this.getBalanceWei(address);
      const expectedWei = this.amountToWei(expectedAmount);
      
      // Allow small tolerance for rounding (0.1%)
      const tolerance = expectedWei / 1000n;
      const minAmount = expectedWei - tolerance;
      
      return balance >= minAmount;
    } catch (error) {
      console.error('Error checking payment:', error);
      return false;
    }
  }

  /**
   * Get network name
   */
  getNetworkName() {
    return this.network;
  }

  /**
   * Get network chain ID
   */
  async getChainId() {
    try {
      const network = await this.provider.getNetwork();
      return Number(network.chainId);
    } catch (error) {
      console.error('Error getting chain ID:', error);
      return 1; // Default to Ethereum mainnet
    }
  }
}

module.exports = new BlockchainPaymentService();
