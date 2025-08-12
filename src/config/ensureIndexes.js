const Referral = require('../models/Referral');
const Product = require('../models/Product');

async function ensureReferralPartialUniqueIndex() {
  try {
    // Force drop legacy referredUser unique index if present (ignore failures)
    try {
      await Referral.collection.dropIndex('referredUser_1');
    } catch (e) {
      // ignore if it doesn't exist
    }
    // Ensure indexes per schema (creates partial unique on referredUser when set)
    await Referral.syncIndexes();
  } catch (err) {
    console.warn('ensureReferralPartialUniqueIndex warning:', err.message);
  }
}

async function ensureProductIndexes() {
  try {
    await Product.syncIndexes();
  } catch (err) {
    console.warn('ensureProductIndexes warning:', err.message);
  }
}

async function ensureIndexes() {
  await Promise.all([
    ensureReferralPartialUniqueIndex(),
    ensureProductIndexes(),
  ]);
}

module.exports = {
  ensureIndexes,
};

