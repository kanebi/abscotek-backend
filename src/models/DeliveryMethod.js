const mongoose = require('mongoose');

const DeliveryMethodSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  description: {
    type: String,
  },
  price: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    required: true,
    default: 'NGN',
    enum: ['USDC', 'USD', 'NGN', 'EUR']
  },
  estimatedDeliveryTime: {
    type: String,
  },
  isActive: {
    type: Boolean,
    default: true
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

module.exports = DeliveryMethod = mongoose.model('deliveryMethod', DeliveryMethodSchema);
