const currencyExchangeService = require('../services/currencyExchangeService');

/**
 * GET /api/currency/rates
 * Returns platform exchange rates. Rates come from provider (ExchangeRate-API); hardcoded only on failure.
 */
async function getRates(req, res) {
  try {
    const rates = req.platformRates || await currencyExchangeService.getOrCreateRates();
    const fromProvider = !!req.platformRates;
    console.log('[currency] GET /api/currency/rates: serving rates', fromProvider ? '(from middleware cache)' : '(from getOrCreateRates)');
    res.json({
      base: 'USD',
      rates: currencyExchangeService.applyMarkup(rates),
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('getRates:', err);
    res.status(500).json({
      base: 'USD',
      rates: currencyExchangeService.applyMarkup({
        USDC: 1, USD: 1, NGN: 1500, EUR: 0.92, GHS: 15
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

const ALLOWED_CURRENCIES = ['USDC', 'USD', 'NGN', 'EUR', 'GHS'];

/**
 * PUT /api/currency/me
 * Set session currency (24h). Body: { currency: 'NGN' | 'USD' | 'USDC' | 'EUR' | 'GHS' }.
 * GHC is accepted and normalized to GHS (correct ISO 4217 code for Ghana Cedi).
 */
function setMe(req, res) {
  let raw = (req.body && req.body.currency) ? String(req.body.currency).toUpperCase().trim() : '';
  if (raw === 'USDT') raw = 'USDC';
  if (raw === 'GHC') raw = 'GHS';
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
