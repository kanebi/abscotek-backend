const mongoose = require('mongoose');

const GiveawayItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  name: { type: String, default: '' },
  couponCodes: [{ type: String, trim: true }],
  walletAddresses: [{ type: String, trim: true }],
  claimed: {
    type: Boolean,
    default: false,
  },
  paidDeliveryByUser: {
    type: Boolean,
    default: true,
  },
  claimType: {
    type: String,
    enum: ['immediate', 'time_window'],
    default: 'immediate',
  },
  claimWindowStart: {
    type: Date,
    default: null,
  },
  claimWindowEnd: {
    type: Date,
    default: null,
  },
}, { _id: true });

const GiveawaySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  items: [GiveawayItemSchema],
  expiresAt: {
    type: Date,
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

GiveawaySchema.index({ expiresAt: 1 });

module.exports = mongoose.model('Giveaway', GiveawaySchema);
