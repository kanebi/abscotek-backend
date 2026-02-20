/**
 * Sets user currency in session (24h TTL) and sends it in response header X-User-Currency.
 * For authenticated requests: use user.preferences.currency and store in session.
 * For guest: use session.currency if set, otherwise do not set (frontend can use default).
 */
const SUPPORTED = ['USDC', 'USD', 'NGN', 'EUR', 'GHS', 'GHC'];
const DEFAULT_CURRENCY = 'USD';

function normalizeCurrency(code) {
  if (!code || typeof code !== 'string') return DEFAULT_CURRENCY;
  const c = code.toUpperCase().trim();
  if (c === 'USDT') return 'USDC';
  return SUPPORTED.includes(c) ? c : DEFAULT_CURRENCY;
}

/**
 * Must run after auth middleware when req.user may be set.
 * Session must be available (express-session). Session cookie maxAge is set in server (24h).
 */
function currencySession(req, res, next) {
  const currency = req.user?.preferences?.currency
    ? normalizeCurrency(req.user.preferences.currency)
    : (req.session?.currency ? normalizeCurrency(req.session.currency) : null);

  if (currency) {
    req.session.currency = currency;
    res.setHeader('X-User-Currency', currency);
  } else {
    // Guest or first visit: keep existing session.currency or leave header unset
    if (req.session.currency) {
      res.setHeader('X-User-Currency', normalizeCurrency(req.session.currency));
    }
  }
  req.userCurrency = req.session?.currency || req.user?.preferences?.currency || DEFAULT_CURRENCY;
  next();
}

module.exports = currencySession;
