/**
 * Ensures platform exchange rates are loaded and refreshed every 24h.
 * In-memory cache; one in-flight getOrCreateRates so we don't hammer the DB/API.
 */
const currencyExchangeService = require('../services/currencyExchangeService');

let cachedRates = null;
let cacheTime = 0;
let loadPromise = null;

async function loadExchangeRates(req, res, next) {
  try {
    const now = Date.now();
    if (cachedRates && (now - cacheTime) < currencyExchangeService.RATE_TTL_MS) {
      req.platformRates = cachedRates;
      return next();
    }
    if (loadPromise) {
      req.platformRates = await loadPromise;
      return next();
    }
    loadPromise = currencyExchangeService.getOrCreateRates();
    const rates = await loadPromise;
    cachedRates = rates;
    cacheTime = Date.now();
    req.platformRates = rates;
    next();
  } catch (err) {
    loadPromise = null;
    console.warn('loadExchangeRates:', err.message);
    req.platformRates = currencyExchangeService.normalizeRates({
      USDC: 1,
      USD: 1,
      NGN: 1500,
      EUR: 0.92,
      GHS: 15,
      GHC: 15
    });
    next();
  } finally {
    loadPromise = null;
  }
}

module.exports = loadExchangeRates;
