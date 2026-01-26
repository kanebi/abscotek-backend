const crypto = require('crypto');

/**
 * Add Alchemy context to request for signature verification
 * This middleware stores the raw body before JSON parsing
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Buffer} buf - Raw request body buffer
 * @param {string} encoding - Buffer encoding
 */
function addAlchemyContextToRequest(req, res, buf, encoding) {
  // Store raw body for signature verification
  req.rawBody = buf.toString(encoding || 'utf8');
}

/**
 * Validate Alchemy webhook signature
 * Returns middleware function that validates X-Alchemy-Signature header
 * 
 * @param {string} signingKey - Webhook signing key from Alchemy dashboard (whsec_...)
 * @returns {Function} Express middleware
 */
function validateAlchemySignature(signingKey) {
  return (req, res, next) => {
    // Skip validation if no signing key configured
    if (!signingKey || signingKey === 'whsec_test') {
      console.warn('⚠️  WEBHOOK_SIGNING_KEY not set or using test key - signature verification disabled');
      return next();
    }

    // Get signature from header
    const signature = req.headers['x-alchemy-signature'];
    
    if (!signature) {
      console.warn('Webhook received without X-Alchemy-Signature header');
      return res.status(401).json({ 
        error: 'Missing webhook signature',
        message: 'X-Alchemy-Signature header is required'
      });
    }

    // Get raw body (must be string, not parsed JSON)
    const rawBody = req.rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    
    if (!rawBody) {
      console.error('No raw body available for signature verification');
      return res.status(400).json({ 
        error: 'Invalid request body',
        message: 'Raw body is required for signature verification'
      });
    }

    // Verify signature
    const isValid = isValidSignatureForStringBody(rawBody, signature, signingKey);
    
    if (!isValid) {
      console.warn('Invalid webhook signature received');
      return res.status(401).json({ 
        error: 'Invalid webhook signature',
        message: 'Webhook signature verification failed. Request may be from unauthorized source.'
      });
    }

    console.log('✅ Webhook signature verified successfully');
    next();
  };
}

/**
 * Verify Alchemy webhook signature using HMAC-SHA256
 * 
 * @param {string} body - Raw request body (must be string, not parsed JSON)
 * @param {string} signature - X-Alchemy-Signature header value
 * @param {string} signingKey - Webhook signing key from Alchemy dashboard
 * @returns {boolean} - True if signature is valid
 */
function isValidSignatureForStringBody(body, signature, signingKey) {
  if (!signature || !signingKey) {
    return false;
  }

  try {
    // Create HMAC SHA256 hash using the signing key
    const hmac = crypto.createHmac('sha256', signingKey);
    
    // Update the token hash with the request body using utf8
    // Convert Buffer to string if needed
    const bodyString = Buffer.isBuffer(body) ? body.toString('utf8') : body;
    hmac.update(bodyString, 'utf8');
    
    // Get the digest in hex format
    const digest = hmac.digest('hex');
    
    // Compare signatures (use constant-time comparison to prevent timing attacks)
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(digest, 'hex')
    );
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}

module.exports = {
  addAlchemyContextToRequest,
  validateAlchemySignature,
  isValidSignatureForStringBody
};
