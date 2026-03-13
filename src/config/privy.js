/**
 * Privy config for server-side token verification.
 * Uses PRIVY_APP_ID and optional PRIVY_CLIENT_ID from env (backend root .env).
 * When using app clients (Privy Dashboard > Configuration > App settings > Clients),
 * set PRIVY_CLIENT_ID so token verification matches the frontend client.
 */

const privyAppId = process.env.PRIVY_APP_ID;
const privyClientId = process.env.PRIVY_CLIENT_ID || null;
const frontendOrigin = (process.env.FRONTEND_URL || process.env.PRIVY_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');

/**
 * Build headers for calling Privy's /v1/users/me with the user's access token.
 * @param {string} accessToken - User's Privy access token (Bearer).
 * @returns {Record<string, string>} Headers to send to api.privy.io
 */
function getPrivyUserMeHeaders(accessToken) {
  if (!privyAppId) {
    throw new Error('PRIVY_APP_ID is not set. Set it in backend .env (or root env) for Privy token verification.');
  }
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'privy-app-id': privyAppId,
    'Content-Type': 'application/json',
    'Origin': frontendOrigin
  };
  if (privyClientId) {
    headers['privy-client-id'] = privyClientId;
  }
  return headers;
}

module.exports = {
  privyAppId,
  privyClientId,
  frontendOrigin,
  getPrivyUserMeHeaders
};
