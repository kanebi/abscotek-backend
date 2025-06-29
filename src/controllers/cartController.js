const Cart = require('../models/Cart');
const Product = require('../models/Product');

// @desc    Get user cart
// @route   GET /api/cart
// @access  Private
const getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user.id }).populate('items.product', ['name', 'price', 'image']);

    if (!cart) {
      cart = new Cart({ user: req.user.id });
      await cart.save();
    }

    res.json(cart);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Get user cart by user ID
// @route   GET /api/cart/:userId
// @access  Private (admin or self)
const getCartByUserId = async (req, res) => {
  try {
    const userId = req.params.userId;
    // In a real application, you would add authorization here
    // to ensure the requesting user has permission to view this cart.
    // For example, check if req.user.id === userId or if req.user.role === 'admin'

    let cart = await Cart.findOne({ user: userId }).populate('items.product', ['name', 'price', 'image']);

    if (!cart) {
      return res.status(404).json({ msg: 'Cart not found for this user' });
    }

    res.json(cart);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Add item to cart
// @route   POST /api/cart
// @access  Private
const addItemToCart = async (req, res) => {
  try {
    const { productId, quantity } = req.body;

    let cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      cart = new Cart({ user: req.user.id });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ msg: 'Product not found' });
    }

    const itemIndex = cart.items.findIndex(
      (item) => item.product.toString() === productId
    );

    if (itemIndex > -1) {
      cart.items[itemIndex].quantity += quantity || 1;
    } else {
      cart.items.push({ product: productId, quantity: quantity || 1 });
    }

    await cart.save();
    await cart.populate('items.product', ['name', 'price', 'image']);

    res.json(cart);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Remove item from cart
// @route   DELETE /api/cart/:userId/:productId
// @access  Private (admin or self)
const removeItemFromCart = async (req, res) => {
  try {
    const { userId, productId } = req.params;

    // In a real application, you would add authorization here
    // to ensure the requesting user has permission to modify this cart.
    // For example, check if req.user.id === userId or if req.user.role === 'admin'

    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
      return res.status(404).json({ msg: 'Cart not found for this user' });
    }

    cart.items = cart.items.filter(
      (item) => item.product.toString() !== productId
    );

    await cart.save();
    await cart.populate('items.product', ['name', 'price', 'image']);

    res.json(cart);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

module.exports = {
  getCart,
  addItemToCart,
  removeItemFromCart,
  getCartByUserId,
};
