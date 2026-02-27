/**
 * SeerBit Standard Checkout integration
 * @see https://doc.seerbit.com/online-payment/integration-type/standard-checkout
 */

const SEERBIT_ENCRYPT_URL = 'https://seerbitapi.com/api/v2/encrypt/keys';
const SEERBIT_PAYMENTS_URL = 'https://seerbitapi.com/api/v2/payments';
const SEERBIT_QUERY_URL = 'https://seerbitapi.com/api/v3/payments/query';

/**
 * Get Bearer token for API calls (encrypt secret.public key).
 * @returns {Promise<string>} Bearer token (encryptedKey)
 */
async function getBearerToken() {
  const secretKey = process.env.SEERBIT_SECRET_KEY;
  const publicKey = process.env.SEERBIT_PUBLIC_KEY;
  if (!secretKey || !publicKey) {
    throw new Error('SEERBIT_SECRET_KEY and SEERBIT_PUBLIC_KEY must be set');
  }
  const key = `${secretKey}.${publicKey}`;
  const res = await fetch(SEERBIT_ENCRYPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key })
  });
  const data = await res.json();
  if (data?.data?.EncryptedSecKey?.encryptedKey) {
    return data.data.EncryptedSecKey.encryptedKey;
  }
  throw new Error(data?.message || data?.error || 'Failed to get SeerBit token');
}

/**
 * Initialize a payment (Standard Checkout). Returns redirect link for customer.
 * @param {Object} opts
 * @param {string} opts.publicKey - SeerBit public key
 * @param {string} opts.amount - Amount as string (e.g. "500" for NGN)
 * @param {string} opts.currency - e.g. "NGN"
 * @param {string} opts.country - e.g. "NG"
 * @param {string} opts.paymentReference - Unique reference
 * @param {string} opts.email - Customer email
 * @param {string} opts.fullName - Customer full name
 * @param {string} opts.callbackUrl - Where to redirect after payment
 * @returns {Promise<{ redirectLink: string, paymentStatus?: string }>}
 */
async function initializePayment(opts) {
  const token = await getBearerToken();
  const body = {
    publicKey: opts.publicKey,
    amount: String(opts.amount),
    currency: opts.currency || 'NGN',
    country: opts.country || 'NG',
    paymentReference: opts.paymentReference,
    email: opts.email,
    fullName: opts.fullName || opts.email,
    tokenize: 'false',
    callbackUrl: opts.callbackUrl
  };
  const res = await fetch(SEERBIT_PAYMENTS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (data?.status === 'SUCCESS' && data?.data?.payments?.redirectLink) {
    return {
      redirectLink: data.data.payments.redirectLink,
      paymentStatus: data.data.payments.paymentStatus
    };
  }
  throw new Error(data?.message || data?.error || 'SeerBit initialize payment failed');
}

/**
 * Verify payment status with SeerBit backend.
 * Call this before confirming an order so we only confirm when SeerBit reports success.
 * @param {string} paymentReference - The payment reference (e.g. from redirect/success)
 * @returns {Promise<{ success: boolean, amount?: number, message?: string }>}
 */
async function verifyPayment(paymentReference) {
  if (!paymentReference || typeof paymentReference !== 'string') {
    return { success: false, message: 'Invalid payment reference' };
  }
  const token = await getBearerToken();
  const url = `${SEERBIT_QUERY_URL}/${encodeURIComponent(paymentReference)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });
  const data = await res.json().catch(() => ({}));
  // Per SeerBit docs, code "00" indicates a successful transaction
  const code = data?.code ?? data?.data?.code ?? data?.payload?.code;
  const success = code === '00';
  return {
    success: !!success,
    amount: data?.data?.payments?.amount ?? data?.payload?.amount,
    message: data?.message || data?.error || (success ? undefined : 'Payment not confirmed by SeerBit')
  };
}

/**
 * Generate unique payment reference for SeerBit
 */
function generateReference(prefix = 'ABSCO_SB') {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}_${timestamp}_${random}`;
}

module.exports = {
  getBearerToken,
  initializePayment,
  verifyPayment,
  generateReference
};
