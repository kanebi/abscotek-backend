/**
 * Ensures platform exchange rates are loaded and refreshed every 24h from DB/API.
 * In-memory cache (short TTL) so markup/rate changes take effect without full restart.
 */
const currencyExchangeService = require('../services/currencyExchangeService');

let cachedRates = null;
let cacheTime = 0;
let loadPromise = null;
/** Shorter than RATE_TTL_MS so backend markup changes (e.g. 1.8%) are used after deploy without restart. */
const MEMORY_CACHE_MS = 2 * 60 * 1000; // 2 minutes

async function loadExchangeRates(req, res, next) {
  try {
    const now = Date.now();
    if (cachedRates && (now - cacheTime) < MEMORY_CACHE_MS) {
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
    req.platformRates = currencyExchangeService.applyMarkup({
      USDC: 1,
      USD: 1,
      NGN: 1500,
      EUR: 0.92,
      GHS: 15
    });
    next();
  } finally {
    loadPromise = null;
  }
}

module.exports = loadExchangeRates;
