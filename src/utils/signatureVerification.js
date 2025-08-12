const { ethers } = require('ethers');

/**
 * Verify a signed message against a wallet address
 * @param {string} message - The original message that was signed
 * @param {string} signature - The signature to verify
 * @param {string} address - The wallet address to verify against
 * @returns {boolean} - True if signature is valid, false otherwise
 */
const verifySignature = (message, signature, address) => {
  try {
    const decodedAddress = ethers.verifyMessage(message, signature);
    return decodedAddress.toLowerCase() === address.toLowerCase();
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
};

/**
 * Create a message for wallet linking
 * @param {string} walletAddress - The wallet address to link
 * @returns {string} - The message to sign
 */
const createLinkMessage = (walletAddress) => {
  return `Link wallet address: ${walletAddress}`;
};

/**
 * Create an authentication message
 * @param {string} nonce - The nonce for authentication
 * @returns {string} - The message to sign
 */
const createAuthMessage = (nonce) => {
  return `Please sign this message to authenticate: ${nonce}`;
};

/**
 * Verify a wallet linking signature
 * @param {string} walletAddress - The wallet address
 * @param {string} signature - The signature
 * @returns {boolean} - True if signature is valid
 */
const verifyLinkSignature = (walletAddress, signature) => {
  const message = createLinkMessage(walletAddress);
  return verifySignature(message, signature, walletAddress);
};

/**
 * Verify an authentication signature
 * @param {string} nonce - The nonce used for authentication
 * @param {string} signature - The signature
 * @param {string} walletAddress - The wallet address
 * @returns {boolean} - True if signature is valid
 */
const verifyAuthSignature = (nonce, signature, walletAddress) => {
  const message = createAuthMessage(nonce);
  return verifySignature(message, signature, walletAddress);
};

module.exports = {
  verifySignature,
  createLinkMessage,
  createAuthMessage,
  verifyLinkSignature,
  verifyAuthSignature,
}; 