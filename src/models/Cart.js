const mongoose = require('mongoose');

const CartItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  product: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  variant: {
    variantId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    name: { type: String, default: null },
    attributes: [{
      name: { type: String },
      value: { type: String }
    }],
    additionalPrice: { type: Number, default: 0 }
  },
  specs: [{
    label: { type: String },
    value: { type: String }
  }],
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    enum: ['USDC', 'USD', 'NGN', 'EUR'],
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'ordered', 'removed'],
    default: 'active'
  }
});

const CartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  items: [CartItemSchema],
  currency: {
    type: String,
    enum: ['USDC', 'USD', 'NGN', 'EUR'],
    default: 'USDC'
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  deliveryFee: {
    type: Number,
    default: 0,
    min: 0
  },
  discount: {
    type: Number,
    default: 0,
    min: 0
  },
  total: {
    type: Number,
    required: true,
    min: 0
  },
  selectedAddress: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeliveryAddress'
  },
  selectedDeliveryMethod: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'deliveryMethod'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Normalize USDT → USDC (enum only allows USDC)
function normalizeCurrency(doc) {
  if (doc.currency === 'USDT') doc.currency = 'USDC';
  if (doc.items && Array.isArray(doc.items)) {
    doc.items.forEach((item) => {
      if (item.currency === 'USDT') item.currency = 'USDC';
    });
  }
}

CartSchema.pre('validate', function(next) {
  normalizeCurrency(this);
  next();
});

CartSchema.pre('save', function(next) {
  normalizeCurrency(this);
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Cart', CartSchema);
