const mongoose = require('mongoose');

// Order Item Schema - separate collection for order items
const OrderItemSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
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
  totalPrice: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    enum: ['USDT', 'USD', 'NGN', 'EUR'],
    required: true,
    default: 'USDT'
  },
  status: {
    type: String,
    enum: ['ordered', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
    default: 'ordered'
  },
  // Store product image and name directly for easier access
  productImage: {
    type: String,
    default: null
  },
  productName: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});


// Main Order Schema
const OrderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true,
    sparse: true
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  shippingAddress: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeliveryAddress'
  },
  items: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OrderItem'
  }],
  payments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment'
  }],
  deliveryMethod: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'deliveryMethod',
    required: true
  },
  subTotal: {
    type: Number,
    required: true,
    min: 0
  },
  deliveryFee: {
    type: Number,
    required: true,
    min: 0
  },
  taxAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    enum: ['USDT', 'USD', 'NGN', 'EUR'],
    default: 'USDT'
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
    default: 'pending'
  },
  currentStage: {
    type: Number,
    enum: [1, 2, 3, 4],
    default: 1,
    comment: '1: Submit Order, 2: Waiting for Delivery, 3: Out for delivery, 4: Transaction Complete'
  },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'partial', 'paid', 'refunded', 'failed'],
    default: 'unpaid'
  },
  fulfillmentStatus: {
    type: String,
    enum: ['unfulfilled', 'partial', 'fulfilled'],
    default: 'unfulfilled'
  },
  trackingNumber: {
    type: String,
    sparse: true
  },
  notes: {
    type: String,
    default: ''
  },
  orderDate: {
    type: Date,
    default: Date.now
  },
  estimatedDeliveryDate: {
    type: Date
  },
  actualDeliveryDate: {
    type: Date
  },
  // Crypto payment fields
  paymentMethod: {
    type: String,
    enum: ['wallet', 'paystack', 'crypto', 'card'],
    default: 'wallet'
  },
  paymentAddress: {
    type: String,
    sparse: true,
    default: null
  },
  paymentExpiry: {
    type: Date,
    sparse: true,
    default: null
  },
  paymentTransactionHash: {
    type: String,
    sparse: true,
    default: null
  },
  paymentNetwork: {
    type: String,
    enum: ['base', 'ethereum', 'polygon', 'bsc'],
    sparse: true,
    default: null
  },
  paymentConfirmations: {
    type: Number,
    default: 0
  },
  requiredConfirmations: {
    type: Number,
    default: 3
  },
  // Fund sweeping fields
  fundsSwept: {
    type: Boolean,
    default: false
  },
  fundsSweptAt: {
    type: Date,
    sparse: true,
    default: null
  },
  fundsSweptTxHash: {
    type: String,
    sparse: true,
    default: null
  },
  fundsSweptNote: {
    type: String,
    sparse: true,
    default: null
  }
}, {
  timestamps: true
});

// Generate order number
OrderSchema.pre('save', async function(next) {
  if (this.isNew && !this.orderNumber) {
    const count = await mongoose.model('Order').countDocuments();
    this.orderNumber = `ORD-${Date.now()}-${(count + 1).toString().padStart(4, '0')}`;
  }
  next();
});

// Virtual for calculated total amount in order currency
OrderSchema.virtual('calculatedTotal').get(function() {
  let total = 0;

  // Sum all order items (already converted to order currency during creation)
  if (this.items && this.items.length > 0) {
    total += this.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
  }

  // Add delivery fee (convert if different currency)
  let deliveryFee = this.deliveryFee || 0;
  if (this.deliveryMethod && this.deliveryMethod.currency && this.deliveryMethod.currency !== this.currency) {
    // Convert delivery fee to order currency
    if (this.deliveryMethod.currency === 'NGN' && this.currency === 'USDT') {
      deliveryFee = this.deliveryMethod.price / 1500;
    } else if (this.deliveryMethod.currency === 'USDT' && this.currency === 'NGN') {
      deliveryFee = this.deliveryMethod.price * 1500;
    }
  }

  total += deliveryFee;

  return total;
});

// Ensure virtual fields are serialized
OrderSchema.set('toJSON', { virtuals: true });
OrderSchema.set('toObject', { virtuals: true });

// Indexes for better performance
OrderSchema.index({ buyer: 1, orderDate: -1 });
OrderSchema.index({ orderNumber: 1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ paymentStatus: 1 });


module.exports = {
  Order: mongoose.model('Order', OrderSchema),
  OrderItem: mongoose.model('OrderItem', OrderItemSchema)
};
