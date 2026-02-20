const { ethers } = require('ethers');
const crypto = require('crypto');
const web3Config = require('../config/web3Config');

/**
 * Blockchain Payment Service
 * Handles payment address generation and blockchain interactions
 */
class BlockchainPaymentService {
  constructor() {
    this.network = process.env.ACTIVE_NETWORK || 'base';
    this.provider = this.createProvider();
    this.masterSeed = this.getMasterSeed();
    
    // ERC-20 Token Contract Addresses
    this.tokenContracts = {
      base: {
        USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', // Bridged USDT on Base
        USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Native USDC on Base
      },
      ethereum: {
        USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT on Ethereum
        USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0c3606eB48', // USDC on Ethereum
      },
      polygon: {
        USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // USDT on Polygon
        USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC on Polygon
      },
      bsc: {
        USDT: '0x55d398326f99059fF775485246999027B3197955', // USDT on BSC
        BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', // BUSD on BSC
      }
    };

    // ERC-20 Token ABI (minimal - just what we need for transfers)
    this.erc20ABI = [
      'function balanceOf(address owner) view returns (uint256)',
      'function transfer(address to, uint256 amount) returns (bool)',
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)'
    ];
  }

  /**
   * Create provider based on network
   * Prefers Alchemy (better webhooks), falls back to Infura
   */
  createProvider() {
    const networkConfig = web3Config[this.network] || web3Config.base;
    
    // Prefer Alchemy if API key is available (better webhook support)
    const useAlchemy = !!process.env.ALCHEMY_API_KEY;
    
    if (this.network === 'base') {
      if (useAlchemy) {
        return new ethers.JsonRpcProvider(
          `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
        );
      }
      return new ethers.JsonRpcProvider('https://mainnet.base.org');
    } else if (this.network === 'ethereum') {
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
    
    // Default to Base with Alchemy or public RPC
    if (useAlchemy) {
      return new ethers.JsonRpcProvider(
        `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
      );
    }
    return new ethers.JsonRpcProvider('https://mainnet.base.org');
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
   * Generate payment address tied to user (one per user, reused for all orders)
   * Uses deterministic private key generation from user ID
   */
  generatePaymentAddressForUser(userId) {
    try {
      const privateKeyBytes = crypto.createHash('sha256')
        .update('user-' + userId + this.masterSeed)
        .digest();
      const privateKey = '0x' + privateKeyBytes.toString('hex');
      const wallet = new ethers.Wallet(privateKey);
      return wallet.address;
    } catch (error) {
      console.error('Error generating user payment address:', error);
      const hash = crypto.createHash('sha256')
        .update('user-' + userId + this.masterSeed + Date.now())
        .digest('hex');
      const privateKey = '0x' + hash.slice(0, 64);
      const wallet = new ethers.Wallet(privateKey);
      return wallet.address;
    }
  }

  /**
   * Get wallet for user-tied payment address (for signing sweep txs)
   */
  getPaymentWalletForUser(userId) {
    try {
      const privateKeyBytes = crypto.createHash('sha256')
        .update('user-' + userId + this.masterSeed)
        .digest();
      const privateKey = '0x' + privateKeyBytes.toString('hex');
      return new ethers.Wallet(privateKey, this.provider);
    } catch (error) {
      console.error('Error getting user payment wallet:', error);
      throw error;
    }
  }

  /**
   * Generate unique payment address for an order (legacy - order-specific)
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
   * @param {string} address - Payment address
   * @param {number} expectedAmount - Expected amount
   * @param {string} [currency='USDC'] - Currency: USDC for token, or native (ETH/MATIC/BNB)
   */
  async checkPaymentReceived(address, expectedAmount, currency = 'USDC') {
    try {
      const isToken = currency === 'USDC' || currency === 'USD';
      if (isToken) {
        return this.checkTokenPaymentReceived(address, expectedAmount, 'USDC');
      }
      const balance = await this.getBalanceWei(address);
      const expectedWei = this.amountToWei(expectedAmount);
      const tolerance = expectedWei / 1000n;
      const minAmount = expectedWei - tolerance;
      return balance >= minAmount;
    } catch (error) {
      console.error('Error checking payment:', error);
      return false;
    }
  }

  /**
   * Round amount to token decimals to avoid "too many decimals" parseUnits error.
   * USDC uses 6 decimals; floating point math can produce values like 63.333333333333336.
   */
  _roundForTokenDecimals(amount, decimals = 6) {
    const factor = 10 ** decimals;
    return (Math.floor(Number(amount) * factor) / factor).toFixed(decimals);
  }

  /**
   * Check if address received token payment (USDC)
   */
  async checkTokenPaymentReceived(address, expectedAmount, token = 'USDC') {
    try {
      const balanceRaw = await this.getUSDCBalanceRaw(address);
      const tokenContract = this.getUSDCContractAddress();
      const tokenContractObj = new ethers.Contract(tokenContract, this.erc20ABI, this.provider);
      const decimals = await tokenContractObj.decimals();
      const roundedAmount = this._roundForTokenDecimals(expectedAmount, decimals);
      const expectedRaw = ethers.parseUnits(roundedAmount, decimals);
      const tolerance = expectedRaw / 1000n;
      const minAmount = expectedRaw - tolerance;
      return balanceRaw >= minAmount;
    } catch (error) {
      console.error('Error checking token payment:', error);
      return false;
    }
  }

  getUSDCContractAddress() {
    const networkTokens = this.tokenContracts[this.network];
    if (!networkTokens || !networkTokens.USDC) {
      throw new Error(`USDC not supported on network: ${this.network}`);
    }
    return networkTokens.USDC;
  }

  async getUSDCBalance(address) {
    try {
      const usdcAddress = this.getUSDCContractAddress();
      const tokenContract = new ethers.Contract(usdcAddress, this.erc20ABI, this.provider);
      const balance = await tokenContract.balanceOf(address);
      const decimals = await tokenContract.decimals();
      return ethers.formatUnits(balance, decimals);
    } catch (error) {
      console.error('Error getting USDC balance:', error);
      throw error;
    }
  }

  async getUSDCBalanceRaw(address) {
    try {
      const usdcAddress = this.getUSDCContractAddress();
      const tokenContract = new ethers.Contract(usdcAddress, this.erc20ABI, this.provider);
      return await tokenContract.balanceOf(address);
    } catch (error) {
      console.error('Error getting USDC balance raw:', error);
      throw error;
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

  /**
   * Get private key for a payment address (derived from orderId)
   * Uses the same logic as generatePaymentAddress to ensure consistency
   */
  getPaymentPrivateKey(orderId) {
    try {
      // Generate deterministic private key from order ID + master secret
      // This must match the logic in generatePaymentAddress
      const privateKeyBytes = crypto.createHash('sha256')
        .update(orderId + this.masterSeed)
        .digest();
      
      const privateKey = '0x' + privateKeyBytes.toString('hex');
      
      // Validate private key by creating wallet
      const wallet = new ethers.Wallet(privateKey);
      
      return privateKey;
    } catch (error) {
      console.error('Error getting payment private key:', error);
      throw error;
    }
  }

  /**
   * Get wallet instance for a payment address
   */
  getPaymentWallet(orderId) {
    try {
      const privateKey = this.getPaymentPrivateKey(orderId);
      return new ethers.Wallet(privateKey, this.provider);
    } catch (error) {
      console.error('Error getting payment wallet:', error);
      throw error;
    }
  }

  /**
   * Sweep funds from a payment address to the main wallet
   * @param {string} orderId - Order ID to get payment address
   * @param {string} mainWalletAddress - Address to send funds to
   * @returns {Promise<Object>} Transaction receipt
   */
  async sweepFunds(orderId, mainWalletAddress) {
    try {
      const paymentWallet = this.getPaymentWallet(orderId);
      const paymentAddress = paymentWallet.address;
      return this._sweepFundsFromWallet(paymentWallet, paymentAddress, mainWalletAddress);
    } catch (error) {
      console.error('Error sweeping funds:', error);
      throw error;
    }
  }

  /**
   * Get USDT token contract address for current network
   */
  getUSDTContractAddress() {
    const networkTokens = this.tokenContracts[this.network];
    if (!networkTokens || !networkTokens.USDT) {
      throw new Error(`USDT not supported on network: ${this.network}`);
    }
    return networkTokens.USDT;
  }

  /**
   * Get USDT balance of an address
   */
  async getUSDTBalance(address) {
    try {
      const usdtAddress = this.getUSDTContractAddress();
      const tokenContract = new ethers.Contract(usdtAddress, this.erc20ABI, this.provider);
      
      const balance = await tokenContract.balanceOf(address);
      const decimals = await tokenContract.decimals();
      
      // USDT has 6 decimals, format accordingly
      return ethers.formatUnits(balance, decimals);
    } catch (error) {
      console.error('Error getting USDT balance:', error);
      throw error;
    }
  }

  /**
   * Get USDT balance in raw units (for exact comparisons)
   */
  async getUSDTBalanceRaw(address) {
    try {
      const usdtAddress = this.getUSDTContractAddress();
      const tokenContract = new ethers.Contract(usdtAddress, this.erc20ABI, this.provider);
      return await tokenContract.balanceOf(address);
    } catch (error) {
      console.error('Error getting USDT balance raw:', error);
      throw error;
    }
  }

  /**
   * Pay from wallet: transfer order amount to platform wallet (MAIN_WALLET_ADDRESS from env).
   * Supports both user-tied addresses (one per user) and legacy order-specific addresses.
   * @param {string} orderId - Order ID
   * @param {string} currency - Order currency (USDC, USDT, USD, etc.)
   * @param {Object} options - { buyerId } for user-tied address lookup
   * @returns {Promise<Object>} Result of sweep
   */
  async payFromWallet(orderId, currency = 'USDC', options = {}) {
    const mainWalletAddress = process.env.MAIN_WALLET_ADDRESS;
    if (!mainWalletAddress) {
      throw new Error('MAIN_WALLET_ADDRESS not set in environment');
    }
    const isStablecoin = currency === 'USDC' || currency === 'USD';
    const useUserTied = !!options.buyerId;
    const token = 'USDC';
    if (useUserTied) {
      return isStablecoin ? this.sweepTokenByUser(options.buyerId, mainWalletAddress, token) : this.sweepFundsByUser(options.buyerId, mainWalletAddress);
    }
    return isStablecoin ? this.sweepToken(orderId, mainWalletAddress, token) : this.sweepFunds(orderId, mainWalletAddress);
  }

  async sweepTokenByUser(userId, mainWalletAddress, token = 'USDC') {
    const paymentWallet = this.getPaymentWalletForUser(userId);
    const paymentAddress = paymentWallet.address;
    return this._sweepTokenFromWallet(paymentWallet, paymentAddress, mainWalletAddress, token);
  }

  async sweepToken(orderId, mainWalletAddress, token = 'USDC') {
    try {
      const paymentWallet = this.getPaymentWallet(orderId);
      const paymentAddress = paymentWallet.address;
      return this._sweepTokenFromWallet(paymentWallet, paymentAddress, mainWalletAddress, token);
    } catch (error) {
      console.error(`Error sweeping ${token}:`, error);
      throw error;
    }
  }

  async _sweepTokenFromWallet(paymentWallet, paymentAddress, mainWalletAddress, token = 'USDC') {
    try {
      const tokenAddress = this.getUSDCContractAddress();
      const tokenContract = new ethers.Contract(tokenAddress, this.erc20ABI, paymentWallet);
      const balanceRaw = await this.getUSDCBalanceRaw(paymentAddress);

      if (balanceRaw === 0n) {
        return { success: false, message: `No ${token} to sweep`, balance: '0' };
      }

      const decimals = await tokenContract.decimals();
      const balanceFormatted = ethers.formatUnits(balanceRaw, decimals);
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice || feeData.maxFeePerGas;
      if (!gasPrice) throw new Error('Unable to get gas price');

      let gasEstimate;
      try {
        gasEstimate = await tokenContract.transfer.estimateGas(mainWalletAddress, balanceRaw);
      } catch (error) {
        gasEstimate = 65000n;
      }

      const gasCost = (gasEstimate * gasPrice * 120n) / 100n;
      const nativeBalance = await this.getBalanceWei(paymentAddress);

      if (nativeBalance < gasCost) {
        return {
          success: false,
          message: `Insufficient native token to cover gas fees for ${token} transfer`,
          usdcBalance: balanceFormatted,
          nativeBalance: ethers.formatEther(nativeBalance),
          gasCost: ethers.formatEther(gasCost)
        };
      }

      console.log(`Sweeping ${balanceFormatted} ${token} from ${paymentAddress} to ${mainWalletAddress}`);
      const tx = await tokenContract.transfer(mainWalletAddress, balanceRaw, { gasLimit: gasEstimate, gasPrice });
      const receipt = await tx.wait();

      return {
        success: true,
        transactionHash: tx.hash,
        receipt,
        amount: balanceFormatted,
        token,
        from: paymentAddress,
        to: mainWalletAddress
      };
    } catch (error) {
      console.error(`Error sweeping ${token}:`, error);
      throw error;
    }
  }


  /**
   * Sweep native funds from user-tied payment address
   */
  async sweepFundsByUser(userId, mainWalletAddress) {
    const paymentWallet = this.getPaymentWalletForUser(userId);
    const paymentAddress = paymentWallet.address;
    return this._sweepFundsFromWallet(paymentWallet, paymentAddress, mainWalletAddress);
  }

  async _sweepFundsFromWallet(paymentWallet, paymentAddress, mainWalletAddress) {
    const balance = await this.getBalanceWei(paymentAddress);
    if (balance === 0n) {
      return { success: false, message: 'No funds to sweep', balance: '0' };
    }
    const feeData = await this.provider.getFeeData();
    const gasPrice = feeData.gasPrice || feeData.maxFeePerGas;
    if (!gasPrice) throw new Error('Unable to get gas price');
    let gasEstimate;
    try {
      gasEstimate = await this.provider.estimateGas({ from: paymentAddress, to: mainWalletAddress, value: balance });
    } catch (e) {
      gasEstimate = 21000n;
    }
    const gasCost = (gasEstimate * gasPrice * 120n) / 100n;
    if (balance <= gasCost) {
      return { success: false, message: 'Insufficient funds to cover gas fees', balance: ethers.formatEther(balance), gasCost: ethers.formatEther(gasCost) };
    }
    const amountToSend = balance - gasCost;
    const tx = await paymentWallet.sendTransaction({ to: mainWalletAddress, value: amountToSend, gasLimit: gasEstimate, gasPrice });
    const receipt = await tx.wait();
    return { success: true, transactionHash: tx.hash, receipt, amount: ethers.formatEther(amountToSend), token: 'ETH', from: paymentAddress, to: mainWalletAddress };
  }
}

module.exports = new BlockchainPaymentService();
