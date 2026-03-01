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
 * Single attempt to query SeerBit for the status of a payment reference.
 * Returns the full parsed response body (or {} on parse failure).
 * @param {number} [timeoutMs=20000] - Request timeout in ms (default 20s)
 */
async function querySeerbit(paymentReference, token, timeoutMs = 20000) {
  const url = `${SEERBIT_QUERY_URL}/${encodeURIComponent(paymentReference)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const body = await res.json().catch(() => ({}));
    return { httpStatus: res.status, body };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`SeerBit query timed out after ${timeoutMs}ms`);
    }
    throw err;
  }
}

/**
 * Parse a SeerBit query response and determine if the payment was successful.
 * Per docs: outer status === "SUCCESS" AND data.code === "00" means success.
 * Also accept data.payments.gatewayCode === "00" as a secondary check.
 */
function parseSeerbitResult(body) {
  // Shape: { status, data: { code, message, payments: { ... } } }
  const outerStatus = body?.status;
  const innerCode = body?.data?.code ?? body?.code;
  const gatewayCode = body?.data?.payments?.gatewayCode;
  const payments = body?.data?.payments ?? body?.payments;

  const success =
    outerStatus === 'SUCCESS' &&
    (innerCode === '00' || (!innerCode && gatewayCode === '00'));

  return {
    success: !!success,
    amount: payments?.amount,
    paymentReference: payments?.paymentReference,
    message: body?.data?.message || body?.message || body?.error ||
      (success ? undefined : `SeerBit code: ${innerCode || '?'}`)
  };
}

/**
 * Verify payment status with SeerBit.
 * Retries up to maxAttempts times with exponential backoff (SeerBit may redirect the user
 * before the payment is fully processed on their backend – a race condition).
 * @param {string} paymentReference
 * @param {object} [opts]
 * @param {number} [opts.maxAttempts=8]
 * @param {number} [opts.initialDelayMs=2500]
 * @param {number} [opts.queryTimeoutMs=20000] - Timeout per query request in ms
 * @returns {Promise<{ success: boolean, amount?: number, message?: string, attempts?: number }>}
 */
async function verifyPayment(paymentReference, opts = {}) {
  if (!paymentReference || typeof paymentReference !== 'string') {
    return { success: false, message: 'Invalid payment reference' };
  }

  const maxAttempts = opts.maxAttempts ?? 8;
  const initialDelayMs = opts.initialDelayMs ?? 2500;
  const queryTimeoutMs = opts.queryTimeoutMs ?? 20000;

  let token;
  try {
    token = await getBearerToken();
  } catch (err) {
    return { success: false, message: `Could not obtain SeerBit token: ${err.message}` };
  }

  let lastResult = { success: false, message: 'No attempts made' };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { httpStatus, body } = await querySeerbit(paymentReference, token, queryTimeoutMs);
      console.log(`[SeerBit verify] attempt ${attempt}/${maxAttempts} ref=${paymentReference} http=${httpStatus} code=${body?.data?.code}`);

      const result = parseSeerbitResult(body);
      lastResult = { ...result, attempts: attempt };

      if (result.success) {
        return lastResult;
      }

      // If SeerBit explicitly says the transaction failed (non-pending code), stop retrying
      const innerCode = body?.data?.code ?? body?.code;
      const isPending = !innerCode || innerCode === '09' || httpStatus === 404;
      if (!isPending && attempt < maxAttempts) {
        console.log(`[SeerBit verify] payment definitively failed (code ${innerCode}), stopping retries`);
        return lastResult;
      }
    } catch (err) {
      console.warn(`[SeerBit verify] attempt ${attempt} error: ${err.message}`);
      lastResult = { success: false, message: err.message, attempts: attempt };
    }

    if (attempt < maxAttempts) {
      const delay = initialDelayMs * Math.pow(1.5, attempt - 1);
      console.log(`[SeerBit verify] waiting ${Math.round(delay)}ms before retry ${attempt + 1}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  return lastResult;
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
  parseSeerbitResult,
  generateReference
};
