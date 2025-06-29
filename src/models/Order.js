const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'product',
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
  },
  orderStatus: {
    type: String,
    enum: ['Created', 'Paid', 'Shipped', 'Delivered', 'Cancelled'],
    default: 'Created',
  },
  contractAddress: {
    type: String,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

module.exports = Order = mongoose.model('order', OrderSchema);
