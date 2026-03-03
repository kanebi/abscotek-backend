const axios = require('axios');
const CurrencyExchangeRate = require('../models/CurrencyExchangeRate');

const EXCHANGE_RATE_API_KEY = process.env.EXCHANGE_RATE_API_KEY || '798a7fb97cb75d0e80d87765';
const EXCHANGE_RATE_API_BASE = 'https://v6.exchangerate-api.com/v6';

const RATE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours auto-cache; refresh from provider when stale
/** Platform margin: we keep 1.85%, so customer pays rate * 1.0185 (higher fiat per USD). */
const RATE_MARGIN_PERCENT = 1.85;
const RATE_MARGIN_MULTIPLIER = 1 + RATE_MARGIN_PERCENT / 100;

/** Fallback only when provider request fails or a rate is missing from response. */
const DEFAULT_RATES = {
  USDC: 1,
  USD: 1,
  NGN: 1500,
  EUR: 0.92,
  GHS: 15
};

/**
 * Ensure no rate is 0, NaN, or invalid (would break conversion and show 0 on frontend).
 */
function sanitizeRates(rates) {
  const out = { ...rates };
  for (const [key, value] of Object.entries(out)) {
    const num = typeof value === 'number' ? value : Number(value);
    if (value == null || Number.isNaN(num) || num <= 0) {
      out[key] = DEFAULT_RATES[key] ?? (key === 'USD' || key === 'USDC' ? 1 : 1);
    }
  }
  return out;
}

/**
 * Apply platform margin (1.85%): multiply non-base rates so customer pays a bit more fiat per USD.
 */
function applyMarkup(rates) {
  const out = { ...rates };
  const baseKeys = ['USD', 'USDC'];
  for (const [key, value] of Object.entries(out)) {
    if (value != null && typeof value === 'number' && value > 0 && !baseKeys.includes(key)) {
      out[key] = value * RATE_MARGIN_MULTIPLIER;
    }
  }
  return out;
}

function normalizeRates(rates) {
  const r = { ...rates };
  // Only canonical codes: GHS (not GHC). Alias USDC from USD if missing.
  if (r.USD !== undefined && r.USDC === undefined) r.USDC = r.USD;
  if (r.USDC === undefined) r.USDC = 1;
  // Do not add GHC; API returns only ISO 4217 codes (GHS for Ghana Cedi).
  return r;
}

/**
 * Fetch rates from ExchangeRate-API v6.
 * Base is USD; API returns conversion_rates (units per 1 USD).
 * Returns provider rates; uses DEFAULT_RATES only when request fails or a rate is missing.
 */
async function fetchRatesFromApi() {
  const url = `${EXCHANGE_RATE_API_BASE}/${EXCHANGE_RATE_API_KEY}/latest/USD`;
  try {
    const { data } = await axios.get(url, { timeout: 10000 });
    if (data?.result === 'success' && data?.conversion_rates) {
      const r = data.conversion_rates;
      const raw = sanitizeRates({
        USDC: 1,
        USD: 1,
        NGN: r.NGN ?? DEFAULT_RATES.NGN,
        EUR: r.EUR ?? DEFAULT_RATES.EUR,
        GHS: r.GHS ?? DEFAULT_RATES.GHS
      });
      const rates = normalizeRates(applyMarkup(raw));
      console.log('[currency] provider rates (raw)', {
        NGN: raw.NGN,
        EUR: raw.EUR,
        GHS: raw.GHS
      });
      console.log('[currency] platform rates with margin', {
        NGN: rates.NGN,
        EUR: rates.EUR,
        GHS: rates.GHS
      });
      return rates;
    }
  } catch (err) {
    console.warn('[currency] ExchangeRate-API fetch failed:', err.message);
  }
  return normalizeRates(applyMarkup(sanitizeRates(DEFAULT_RATES)));
}

/**
 * Get or create the single platform rates document. Refreshes from provider when older than RATE_TTL_MS (24h).
 * Returns provider rates; uses hardcoded fallback only when provider fetch fails.
 */
async function getOrCreateRates() {
  const now = new Date();
  let doc = await CurrencyExchangeRate.findOne().sort({ updatedAt: -1 }).lean();
  const age = doc ? (now - new Date(doc.updatedAt)) : (RATE_TTL_MS || 1) + 1;
  const stale = !doc || RATE_TTL_MS <= 0 || age >= RATE_TTL_MS;
  if (stale) {
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
  return sanitizeRates(doc.rates);
}

/**
 * Get current platform rates (from DB only; does not trigger refresh).
 * Prefer getOrCreateRates() so rates come from provider; this is used when DB already has rates.
 * Returns hardcoded fallback only when no document exists.
 */
async function getRates() {
  const doc = await CurrencyExchangeRate.findOne().sort({ updatedAt: -1 }).lean();
  if (doc && doc.rates) {
    console.log('[currency] getRates: from DB, updatedAt:', doc.updatedAt);
    return normalizeRates(sanitizeRates(doc.rates));
  }
  console.log('[currency] getRates: no document, using hardcoded fallback');
  return normalizeRates(applyMarkup(sanitizeRates(DEFAULT_RATES)));
}

/**
 * Convert amount between currencies using platform rates.
 */
function convert(amount, fromCurrency, toCurrency, rates) {
  const from = fromCurrency === 'USDT' ? 'USDC' : (fromCurrency === 'GHC' ? 'GHS' : fromCurrency);
  const to = toCurrency === 'USDT' ? 'USDC' : (toCurrency === 'GHC' ? 'GHS' : toCurrency);
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
