const paystack = require('paystack')(process.env.PAYSTACK_SECRET_KEY);

class PaystackService {
  /**
   * Initialize a Paystack transaction
   * @param {Object} transactionData - Transaction details
   * @param {string} transactionData.email - Customer email
   * @param {number} transactionData.amount - Amount in kobo (smallest currency unit)
   * @param {string} transactionData.reference - Unique transaction reference
   * @param {string} transactionData.currency - Currency code (default: NGN)
   * @param {Object} transactionData.metadata - Additional metadata
   * @returns {Promise<Object>} Paystack response
   */
  static async initializeTransaction(transactionData) {
    try {
      const {
        email,
        amount,
        reference,
        currency = 'NGN',
        metadata = {}
      } = transactionData;

      const response = await paystack.transaction.initialize({
        email,
        amount,
        reference,
        currency,
        metadata
      });

      return response;
    } catch (error) {
      console.error('Paystack initialization error:', error);
      throw new Error(`Failed to initialize Paystack transaction: ${error.message}`);
    }
  }

  /**
   * Verify a Paystack transaction
   * @param {string} reference - Transaction reference
   * @returns {Promise<Object>} Transaction verification response
   */
  static async verifyTransaction(reference) {
    try {
      const response = await paystack.transaction.verify(reference);
      return response;
    } catch (error) {
      console.error('Paystack verification error:', error);
      throw new Error(`Failed to verify Paystack transaction: ${error.message}`);
    }
  }

  /**
   * Create a customer on Paystack
   * @param {Object} customerData - Customer details
   * @param {string} customerData.email - Customer email
   * @param {string} customerData.first_name - Customer first name
   * @param {string} customerData.last_name - Customer last name
   * @param {string} customerData.phone - Customer phone number
   * @returns {Promise<Object>} Customer creation response
   */
  static async createCustomer(customerData) {
    try {
      const response = await paystack.customer.create(customerData);
      return response;
    } catch (error) {
      console.error('Paystack customer creation error:', error);
      throw new Error(`Failed to create Paystack customer: ${error.message}`);
    }
  }

  /**
   * Get customer details from Paystack
   * @param {string} customerId - Customer ID or email
   * @returns {Promise<Object>} Customer details
   */
  static async getCustomer(customerId) {
    try {
      const response = await paystack.customer.get(customerId);
      return response;
    } catch (error) {
      console.error('Paystack get customer error:', error);
      throw new Error(`Failed to get Paystack customer: ${error.message}`);
    }
  }

  /**
   * Convert amount to kobo (Paystack's smallest currency unit)
   * @param {number} amount - Amount in major currency unit
   * @param {string} currency - Currency code
   * @returns {number} Amount in kobo
   */
  static convertToKobo(amount, currency = 'NGN') {
    // For NGN, 1 Naira = 100 Kobo
    // For other currencies, adjust accordingly
    const koboMultiplier = {
      'NGN': 100,
      'GHS': 100, // Ghana Cedis
      'ZAR': 100, // South African Rand
      'USD': 100, // US Dollars (cents)
      'EUR': 100  // Euros (cents)
    };

    return Math.round(amount * (koboMultiplier[currency] || 100));
  }

  /**
   * Generate a unique transaction reference
   * @param {string} prefix - Reference prefix (default: 'ABSCO')
   * @returns {string} Unique reference
   */
  static generateReference(prefix = 'ABSCO') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}_${timestamp}_${random}`;
  }
}

module.exports = PaystackService;

