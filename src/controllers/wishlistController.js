const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');

// @desc    Get user wishlist
// @route   GET /api/wishlist
// @access  Private
const getWishlist = async (req, res) => {
  try {
    let wishlist = await Wishlist.findOne({ user: req.user.id }).populate('items.product', ['name', 'price', 'images']);

    if (!wishlist) {
      wishlist = new Wishlist({ user: req.user.id });
      await wishlist.save();
    }

    res.json(wishlist);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Add item to wishlist
// @route   POST /api/wishlist
// @access  Private
const addItemToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;

    let wishlist = await Wishlist.findOne({ user: req.user.id });

    if (!wishlist) {
      wishlist = new Wishlist({ user: req.user.id });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ msg: 'Product not found' });
    }

    const itemExists = wishlist.items.some(
      (item) => item.product.toString() === productId
    );

    if (!itemExists) {
      wishlist.items.push({ product: productId });
    }

    await wishlist.save();
    await wishlist.populate('items.product', ['name', 'price', 'images']);

    res.json(wishlist);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Remove item from wishlist
// @route   DELETE /api/wishlist/:productId
// @access  Private
const removeItemFromWishlist = async (req, res) => {
  try {
    let wishlist = await Wishlist.findOne({ user: req.user.id });

    if (!wishlist) {
      return res.status(404).json({ msg: 'Wishlist not found' });
    }

    wishlist.items = wishlist.items.filter(
      (item) => item.product.toString() !== req.params.productId
    );

    await wishlist.save();
    await wishlist.populate('items.product', ['name', 'price', 'images']);

    res.json(wishlist);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

module.exports = {
  getWishlist,
  addItemToWishlist,
  removeItemFromWishlist,
};
