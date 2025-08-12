const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  products: [
    {
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'product',
        required: true,
      },
      quantity: {
        type: Number,
        required: true,
        min: 1,
      },
    },
  ],
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
  },
  totalAmount: {
    type: Number,
    required: true,
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
