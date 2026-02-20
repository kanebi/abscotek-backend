const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    enum: ['USDC', 'USD', 'NGN', 'EUR'],
    required: true,
    default: 'USDC'
  },
  method: {
    type: String,
    enum: ['wallet', 'paystack', 'seerbit', 'bank_transfer', 'crypto'],
    required: true
  },
  seerbitReference: {
    type: String,
    sparse: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'],
    default: 'pending'
  },
  reference: {
    type: String,
    sparse: true,
    unique: true
  },
  paystackReference: {
    type: String,
    sparse: true
  },
  walletAddress: {
    type: String,
    sparse: true
  },
  transactionHash: {
    type: String,
    sparse: true
  },
  paymentDate: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Payment', PaymentSchema);
