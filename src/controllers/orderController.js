const Order = require('../models/Order');
const Product = require('../models/Product');
const { awardReferralBonus } = require('./referralController');

// @desc    Create an order
// @route   POST /api/orders
// @access  Private
const createOrder = async (req, res) => {
  try {
    const { products } = req.body; // products should be an array of { productId, quantity }

    if (!products || products.length === 0) {
      return res.status(400).json({ msg: 'No products in order' });
    }

    let totalAmountUSD = 0;
    const orderItems = [];
    const productIds = products.map(p => p.productId);
    const foundProducts = await Product.find({ _id: { $in: productIds } });

    if (foundProducts.length !== productIds.length) {
      return res.status(404).json({ msg: 'One or more products not found' });
    }

    for (const item of products) {
      const product = foundProducts.find(p => p._id.toString() === item.productId);
      if (product) {
        const pricePerUnitUSD = product.price; 
        totalAmountUSD += pricePerUnitUSD * item.quantity;
        orderItems.push({
          productId: item.productId,
          quantity: item.quantity,
          pricePerUnit: pricePerUnitUSD,
        });
      }
    }

    // Create MongoDB order
    const newOrder = new Order({
      buyer: req.user.id,
      products: products.map(p => ({ product: p.productId, quantity: p.quantity })),
      totalAmount: totalAmountUSD,
      orderStatus: 'Created',
      // Add contract address if user has wallet
      contractAddress: req.user.walletAddress ? `0x${req.user.walletAddress.slice(2)}` : null,
    });

    const savedOrder = await newOrder.save();

    // Award referral bonus if applicable
    if (req.user.referredBy) {
      await awardReferralBonus(req.user.id);
    }

    // Populate product details for response
    const populatedOrder = await Order.findById(savedOrder._id)
      .populate('products.product', ['name', 'price', 'image'])
      .populate('buyer', ['name', 'email', 'walletAddress']);

    res.json({
      ...populatedOrder.toObject(),
      message: 'Order created successfully'
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Get all orders for a user
// @route   GET /api/orders
// @access  Private
const getOrders = async (req, res) => {
  try {
    const orders = await Order.find({ buyer: req.user.id })
      .populate('products.product', ['name', 'price', 'image'])
      .populate('buyer', ['name', 'email', 'walletAddress'])
      .sort({ date: -1 });

    res.json(orders);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('products.product', ['name', 'price', 'image'])
      .populate('buyer', ['name', 'email', 'walletAddress']);

    if (!order) {
      return res.status(404).json({ msg: 'Order not found' });
    }

    // Check if user owns this order or is admin
    if (order.buyer._id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Access denied' });
    }

    res.json(order);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Update order status
// @route   PUT /api/orders/:id/status
// @access  Private
const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['Created', 'Paid', 'Shipped', 'Delivered', 'Cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ msg: 'Invalid order status' });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ msg: 'Order not found' });
    }

    // Check if user owns this order or is admin
    if (order.buyer.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Access denied' });
    }

    order.orderStatus = status;
    await order.save();

    const updatedOrder = await Order.findById(order._id)
      .populate('products.product', ['name', 'price', 'image'])
      .populate('buyer', ['name', 'email', 'walletAddress']);

    res.json({
      ...updatedOrder.toObject(),
      message: 'Order status updated successfully'
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
};