const mongoose = require('mongoose');

const DeliveryMethodSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  description: {
    type: String,
  },
  price: {
    type: Number,
    required: true,
  },
  estimatedDeliveryTime: {
    type: String,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

module.exports = DeliveryMethod = mongoose.model('deliveryMethod', DeliveryMethodSchema);
