const mongoose = require('mongoose');

const ReferralSchema = new mongoose.Schema({
  referrer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true,
  },
  // Only unique when set (partial index defined below)
  referredUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: false,
  },
  referralCode: {
    type: String,
    required: true,
    unique: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

// Ensure referredUser is unique only when not null/undefined
ReferralSchema.index(
  { referredUser: 1 },
  { unique: true, partialFilterExpression: { referredUser: { $exists: true, $ne: null } } }
);

module.exports = mongoose.model('referral', ReferralSchema);
