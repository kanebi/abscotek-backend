const axios = require('axios');
const CurrencyExchangeRate = require('../models/CurrencyExchangeRate');

const RATE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_RATES = {
  USDC: 1,
  USD: 1,
  NGN: 1500,
  EUR: 0.92,
  GHS: 15,
  GHC: 15
};

function normalizeRates(rates) {
  const r = { ...rates };
  if (r.GHS !== undefined && r.GHC === undefined) r.GHC = r.GHS;
  if (r.GHC !== undefined && r.GHS === undefined) r.GHS = r.GHC;
  if (r.USD !== undefined && r.USDC === undefined) r.USDC = r.USD;
  if (r.USDC === undefined) r.USDC = 1;
  return r;
}

/**
 * Fetch rates from external API (exchangerate-api.com).
 * Base is USD; API returns conversion_rates (units per 1 USD).
 */
async function fetchRatesFromApi() {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY;
  const baseUrl = `https://v6.exchangerate-api.com/v6/${apiKey || 'demo'}/latest/USD`;
  console.log('[currency] Fetching conversion rates from exchange API:', baseUrl.replace(apiKey || 'demo', '***'));
  try {
    const { data } = await axios.get(baseUrl, { timeout: 10000 });
    if (data?.result === 'success' && data?.conversion_rates) {
      const r = data.conversion_rates;
      const rates = normalizeRates({
        USDC: 1,
        USD: 1,
        NGN: r.NGN ?? DEFAULT_RATES.NGN,
        EUR: r.EUR ?? DEFAULT_RATES.EUR,
        GHS: r.GHS ?? DEFAULT_RATES.GHS,
        GHC: r.GHC ?? r.GHS ?? DEFAULT_RATES.GHC
      });
      console.log('[currency] Exchange API rates received:', JSON.stringify(rates));
      return rates;
    }
  } catch (err) {
    console.warn('[currency] Exchange API fetch failed, using defaults:', err.message);
  }
  console.log('[currency] Using default conversion rates (no API key or API error)');
  return normalizeRates(DEFAULT_RATES);
}

/**
 * Get or create the single platform rates document. If older than 24h, refresh from API.
 * Called by middleware on load / first request.
 */
async function getOrCreateRates() {
  const now = new Date();
  let doc = await CurrencyExchangeRate.findOne().sort({ updatedAt: -1 }).lean();
  const age = doc ? (now - new Date(doc.updatedAt)) : RATE_TTL_MS + 1;
  if (!doc || age >= RATE_TTL_MS) {
    console.log('[currency] Rates stale or missing (age ms:', age, '), refreshing from exchange API');
    const rates = await fetchRatesFromApi();
    if (doc) {
      await CurrencyExchangeRate.updateOne(
        { _id: doc._id },
        { $set: { rates, updatedAt: now, source: 'api' } }
      );
      doc = { ...doc, rates, updatedAt: now };
      console.log('[currency] Updated CurrencyExchangeRate document in DB');
    } else {
      doc = await CurrencyExchangeRate.create({
        base: 'USD',
        rates,
        updatedAt: now,
        source: 'api'
      });
      doc = doc.toObject();
      console.log('[currency] Created new CurrencyExchangeRate document in DB');
    }
  } else {
    console.log('[currency] Serving conversion rates from DB cache (age ms:', age, ')');
  }
  return doc.rates;
}

/**
 * Get current platform rates (from DB only; does not trigger refresh).
 * Used by GET /api/currency/rates.
 */
async function getRates() {
  const doc = await CurrencyExchangeRate.findOne().sort({ updatedAt: -1 }).lean();
  if (doc && doc.rates) {
    console.log('[currency] getRates: from DB, updatedAt:', doc.updatedAt);
    return normalizeRates(doc.rates);
  }
  console.log('[currency] getRates: no document, using defaults');
  return normalizeRates(DEFAULT_RATES);
}

/**
 * Convert amount between currencies using platform rates.
 */
function convert(amount, fromCurrency, toCurrency, rates) {
  const from = fromCurrency === 'USDT' ? 'USDC' : fromCurrency;
  const to = toCurrency === 'USDT' ? 'USDC' : toCurrency;
  if (!rates || rates[from] == null || rates[to] == null) return amount;
  const num = parseFloat(amount);
  if (Number.isNaN(num)) return amount;
  return num * (rates[to] / rates[from]);
}

module.exports = {
  getOrCreateRates,
  getRates,
  convert,
  normalizeRates,
  RATE_TTL_MS
};
