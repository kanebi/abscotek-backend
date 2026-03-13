const mongoose = require('mongoose');

const GiveawayClaimSchema = new mongoose.Schema({
  giveaway: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Giveaway',
    required: true,
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true,
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null,
  },
  claimedAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

GiveawayClaimSchema.index({ giveaway: 1, product: 1, user: 1 }, { unique: true });
GiveawayClaimSchema.index({ giveaway: 1, product: 1 });

module.exports = mongoose.model('GiveawayClaim', GiveawayClaimSchema);
