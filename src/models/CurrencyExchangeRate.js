const mongoose = require('mongoose');

/**
 * Platform currency exchange rates (base: USD).
 * Single document per environment; updated by middleware every 24h from external API.
 * Supported: USDC, USD, NGN, EUR (and aliases GHS/GHC).
 */
const CurrencyExchangeRateSchema = new mongoose.Schema({
  base: {
    type: String,
    default: 'USD',
    enum: ['USD']
  },
  /** Rates: units of each currency per 1 USD. E.g. NGN: 1500 means 1 USD = 1500 NGN */
  rates: {
    USDC: { type: Number, default: 1 },
    USD: { type: Number, default: 1 },
    NGN: { type: Number, default: 1500 },
    EUR: { type: Number, default: 0.92 },
    GHS: { type: Number, default: 15 },
    GHC: { type: Number, default: 15 }
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  source: {
    type: String,
    default: 'platform'
  }
}, {
  timestamps: true,
  collection: 'currencyexchangerates'
});

CurrencyExchangeRateSchema.index({ updatedAt: 1 });

module.exports = mongoose.model('CurrencyExchangeRate', CurrencyExchangeRateSchema);
