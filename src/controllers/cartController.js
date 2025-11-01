const Cart = require('../models/Cart');
const Product = require('../models/Product');

// @desc    Update item quantity in cart
// @route   PUT /api/cart
// @access  Private
const updateItemQuantity = async (req, res) => {
  try {
    const { productId, quantity } = req.body;

    if (!productId || typeof quantity !== 'number' || quantity < 1) {
      return res.status(400).json({ msg: 'productId and positive quantity are required' });
    }

    let cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      return res.status(404).json({ msg: 'Cart not found' });
    }

    const itemIndex = cart.items.findIndex(
      (item) => item.productId.toString() === productId && item.status === 'active'
    );

    if (itemIndex === -1) {
      return res.status(404).json({ msg: 'Active item not found in cart' });
    }

    cart.items[itemIndex].quantity = quantity;

    // Recalculate totals based on active items only
    const activeItems = cart.items.filter(item => item.status === 'active');
    cart.subtotal = activeItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    cart.total = cart.subtotal + (cart.deliveryFee || 0) - (cart.discount || 0);

    await cart.save();
    await cart.populate('items.product', 'name price image');

    // Filter out ordered items and ensure each active cart item has the product image properly mapped
    if (cart && cart.items) {
      cart.items = cart.items
        .filter(item => item.status !== 'ordered') // Only return active items
        .map(item => ({
          ...item.toObject(),
          image: item.product?.image || item.image, // Use image from product or fallback to existing image
          name: item.product?.name || item.name,
          price: item.product?.price || item.price || item.unitPrice
        }));
    }

    res.json(cart);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Get user cart
// @route   GET /api/cart
// @access  Private
const getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user.id }).populate('items.product', 'name price image');

    // Filter out ordered items and ensure each active cart item has the product image properly mapped
    if (cart && cart.items) {
      cart.items = cart.items
        .filter(item => item.status !== 'ordered') // Only return active items
        .map(item => ({
          ...item.toObject(),
          image: item.product?.image || item.image, // Use image from product or fallback to existing image
          name: item.product?.name || item.name,
          price: item.product?.price || item.price || item.unitPrice
        }));

      // Recalculate totals based on active items only
      cart.subtotal = cart.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
      cart.total = cart.subtotal + (cart.deliveryFee || 0) - (cart.discount || 0);
    }

    if (!cart) {
      cart = new Cart({
        user: req.user.id,
        currency: 'USDT',
        subtotal: 0,
        total: 0,
        items: []
      });
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

    let cart = await Cart.findOne({ user: userId }).populate('items.product', 'name price image');

    if (!cart) {
      return res.status(404).json({ msg: 'Cart not found for this user' });
    }

    // Filter out ordered items and ensure each active cart item has the product image properly mapped
    if (cart && cart.items) {
      cart.items = cart.items
        .filter(item => item.status !== 'ordered') // Only return active items
        .map(item => ({
          ...item.toObject(),
          image: item.product?.image || item.image, // Use image from product or fallback to existing image
          name: item.product?.name || item.name,
          price: item.product?.price || item.price || item.unitPrice
        }));

      // Recalculate totals based on active items only
      cart.subtotal = cart.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
      cart.total = cart.subtotal + (cart.deliveryFee || 0) - (cart.discount || 0);
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
    const { productId, quantity, currency, variantName } = req.body;

    let cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      cart = new Cart({
        user: req.user.id,
        currency: currency || 'USDT',
        subtotal: 0,
        total: 0
      });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ msg: 'Product not found' });
    }

    // Find selected variant
    const variant = variantName ? product.variants?.find(v => v.name === variantName) : null;
    const finalPrice = variant ? product.price + (variant.additionalPrice || 0) : product.price;

    const itemIndex = cart.items.findIndex(
      (item) => item.productId.toString() === productId &&
                item.variant?.name === variantName &&
                item.status === 'active'
    );

    if (itemIndex > -1) {
      cart.items[itemIndex].quantity += quantity || 1;
    } else {
      cart.items.push({
        productId: productId,
        product: {
          _id: product._id,
          name: product.name,
          price: product.price,
          image: product.image,
          slug: product.slug,
          currency: product.currency
        },
        variant: variant ? {
          name: variant.name,
          attributes: variant.attributes || [],
          additionalPrice: variant.additionalPrice || 0
        } : null,
        quantity: quantity || 1,
        unitPrice: finalPrice,
        currency: currency || product.currency || 'USDT',
        status: 'active'
      });
    }

    // Calculate totals based on active items only
    const activeItems = cart.items.filter(item => item.status === 'active');
    cart.subtotal = activeItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    cart.total = cart.subtotal + (cart.deliveryFee || 0) - (cart.discount || 0);

    // Ensure cart has required fields
    if (!cart.currency) cart.currency = currency || 'USDT';

    await cart.save();
    await cart.populate('items.product', 'name price image');

    // Filter out ordered items and ensure each active cart item has the product image properly mapped
    if (cart && cart.items) {
      cart.items = cart.items
        .filter(item => item.status !== 'ordered') // Only return active items
        .map(item => ({
          ...item.toObject(),
          image: item.product?.image || item.image, // Use image from product or fallback to existing image
          name: item.product?.name || item.name,
          price: item.product?.price || item.price || item.unitPrice
        }));
    }

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
      (item) => item.productId.toString() !== productId || item.status !== 'active'
    );

    // Recalculate totals based on active items only
    const activeItems = cart.items.filter(item => item.status === 'active');
    cart.subtotal = activeItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    cart.total = cart.subtotal + (cart.deliveryFee || 0) - (cart.discount || 0);

    await cart.save();
    await cart.populate('items.product', 'name price image');

    // Filter out ordered items and ensure each active cart item has the product image properly mapped
    if (cart && cart.items) {
      cart.items = cart.items
        .filter(item => item.status !== 'ordered') // Only return active items
        .map(item => ({
          ...item.toObject(),
          image: item.product?.image || item.image, // Use image from product or fallback to existing image
          name: item.product?.name || item.name,
          price: item.product?.price || item.price || item.unitPrice
        }));
    }

    res.json(cart);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Clear user cart
// @route   DELETE /api/cart/clear
// @access  Private
const clearCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user.id });
    
    if (!cart) {
      return res.status(404).json({ msg: 'Cart not found' });
    }

    console.log('Clearing cart for user:', req.user.id, 'Cart items before clear:', cart.items.length);
    
    // Clear all items from cart
    cart.items = [];
    cart.subtotal = 0;
    cart.total = 0;
    cart.deliveryFee = 0;
    cart.discount = 0;
    
    await cart.save();
    console.log('Cart cleared successfully for user:', req.user.id);

    res.json({ 
      message: 'Cart cleared successfully',
      cart: {
        _id: cart._id,
        user: cart.user,
        items: [],
        subtotal: 0,
        total: 0,
        deliveryFee: 0,
        discount: 0
      }
    });
  } catch (err) {
    console.error('Clear cart error:', err.message);
    res.status(500).json({ msg: 'Server Error', error: err.message });
  }
};

module.exports = {
  getCart,
  addItemToCart,
  removeItemFromCart,
  getCartByUserId,
  updateItemQuantity,
  clearCart,
};
