const mongoose = require('mongoose');

const WishlistItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'product',
    required: true,
  },
});

const WishlistSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true,
    unique: true,
  },
  items: [WishlistItemSchema],
  date: {
    type: Date,
    default: Date.now,
  },
});

module.exports = Wishlist = mongoose.model('wishlist', WishlistSchema);
