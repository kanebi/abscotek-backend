const currencyExchangeService = require('../services/currencyExchangeService');

/**
 * GET /api/currency/rates
 * Returns platform exchange rates (from DB, updated by middleware every 24h).
 * Frontend uses this for all conversion; no exchange rate logic on frontend.
 */
async function getRates(req, res) {
  try {
    const fromCache = !!req.platformRates;
    const rates = req.platformRates || await currencyExchangeService.getRates();
    console.log('[currency] GET /api/currency/rates: serving rates', fromCache ? '(from middleware cache)' : '(from getRates())');
    res.json({
      base: 'USD',
      rates: currencyExchangeService.normalizeRates(rates),
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('getRates:', err);
    res.status(500).json({
      base: 'USD',
      rates: currencyExchangeService.normalizeRates({
        USDC: 1,
        USD: 1,
        NGN: 1500,
        EUR: 0.92,
        GHS: 15,
        GHC: 15
      })
    });
  }
}

/**
 * GET /api/currency/me
 * Returns current user currency (session or user prefs). Also set in X-User-Currency by middleware.
 */
function getMe(req, res) {
  const currency = req.userCurrency || req.session?.currency || req.user?.preferences?.currency || 'USD';
  const normalized = currency === 'USDT' ? 'USDC' : currency;
  res.json({ currency: normalized });
}

const ALLOWED_CURRENCIES = ['USDC', 'USD', 'NGN', 'EUR', 'GHS', 'GHC'];

/**
 * PUT /api/currency/me
 * Set session currency (24h). Body: { currency: 'NGN' | 'USD' | 'USDC' | 'EUR' }.
 * For guests this sets session; for authenticated users this updates session cache (user prefs are source of truth on next load).
 */
function setMe(req, res) {
  let raw = (req.body && req.body.currency) ? String(req.body.currency).toUpperCase().trim() : '';
  if (raw === 'USDT') raw = 'USDC';
  const value = ALLOWED_CURRENCIES.includes(raw) ? raw : 'USD';
  if (req.session) {
    req.session.currency = value;
  }
  res.setHeader('X-User-Currency', value);
  res.json({ currency: value });
}

module.exports = {
  getRates,
  getMe,
  setMe
};
