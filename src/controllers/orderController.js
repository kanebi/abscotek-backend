const mongoose = require('mongoose');
const { Order, OrderItem } = require('../models/Order');
const Payment = require('../models/Payment');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const DeliveryMethod = require('../models/DeliveryMethod');
const { awardReferralBonus } = require('./referralController');
const User = require('../models/User');
const PaystackService = require('../services/paystackService');
const Paystack = require('paystack-api')(process.env.PAYSTACK_SECRET_KEY);
const seerbitService = require('../services/seerbitService');
const { reduceStockOnOrder } = require('../utils/stockAnalysis');

// @desc    Create an order (direct)
// @route   POST /api/orders
// @access  Private
const createOrder = async (req, res) => {
  try {
    const { products, deliveryMethodId, shippingAddress } = req.body; // products should be an array of { productId, quantity }

    if (!products || products.length === 0) {
      return res.status(400).json({ msg: 'No products in order' });
    }

    let subTotalUSD = 0;
    const orderItems = [];
    const productIds = products.map(p => p.productId);
    const foundProducts = await Product.find({ _id: { $in: productIds } });

    if (foundProducts.length !== productIds.length) {
      return res.status(404).json({ msg: 'One or more products not found' });
    }

    for (const item of products) {
      const product = foundProducts.find(p => p._id.toString() === item.productId);
      if (product) {
        // Convert item price to order currency if different
        let itemPrice = product.price;
        if (product.currency && product.currency !== 'USDC') {
          // For now, assume USDC/USD are 1:1, and NGN conversion
          if (product.currency === 'NGN') {
            itemPrice = product.price / 1500; // Convert NGN to USDC
          }
          // Add more conversion logic as needed for other currencies
        }
        subTotalUSD += itemPrice * item.quantity;
        orderItems.push({
          productId: item.productId,
          quantity: item.quantity,
          pricePerUnit: itemPrice,
        });
      }
    }

    let deliveryFee = 0;
    let deliveryMethod = null;
    if (deliveryMethodId) {
      deliveryMethod = await DeliveryMethod.findById(deliveryMethodId);
      if (!deliveryMethod) {
        return res.status(400).json({ msg: 'Invalid delivery method' });
      }
      deliveryFee = deliveryMethod.price || 0;
    }

    const totalAmountUSD = subTotalUSD + deliveryFee;

    // Validate shipping address exists if provided
    if (shippingAddressId) {
      const DeliveryAddress = require('../models/DeliveryAddress');
      const shippingAddress = await DeliveryAddress.findById(shippingAddressId);
      if (!shippingAddress) {
        return res.status(400).json({ msg: 'Invalid shipping address' });
      }
    }

    // Create MongoDB order
    const newOrder = new Order({
      buyer: req.user.id, // Use 'buyer' as per schema
      products: products.map(p => ({ 
        product: p.product._id, 
        quantity: p.quantity,
        price: p.product?.price || 0
      })),
      subTotal: subTotalUSD, // Use 'subTotal' as per schema
      deliveryMethod: deliveryMethod ? deliveryMethod._id : undefined,
      deliveryFee,
      totalAmount: totalAmountUSD,
      status: 'pending', // Changed from 'orderStatus' to 'status'
      currency: 'USDC', // Add currency field
      // Add contract address if user has wallet
      contractAddress: req.user.walletAddress ? `0x${req.user.walletAddress.slice(2)}` : null,
      // Add shipping address ID if provided
      ...(shippingAddressId && { shippingAddress: shippingAddressId })
    });

    const savedOrder = await newOrder.save();

    // Award referral bonus if applicable
    if (req.user.referredBy) {
      await awardReferralBonus(req.user.id);
    }

    // Populate product details for response
    const populatedOrder = await Order.findById(savedOrder._id)
      .populate({
        path: 'items',
        populate: {
          path: 'product',
          select: 'name price images'
        }
      })
      .populate('buyer', ['name', 'email', 'walletAddress']);

    const orderObj = populatedOrder.toObject();
    // Ensure _id is a string
    orderObj._id = orderObj._id.toString();

    res.json({
      ...orderObj,
      message: 'Order created successfully'
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Checkout from cart to order
// @route   POST /api/orders/checkout
// @access  Private
const checkoutFromCart = async (req, res) => {
  try {
    const { 
      deliveryMethodId, 
      shippingAddressId, 
      paymentMethod = 'wallet',
      walletAddress,
      currency = 'USDC',
      notes = ''
    } = req.body;

    let cart = await Cart.findOne({ user: req.user.id }).populate('items.product', ['price']);
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ msg: 'Cart is empty' });
    }

    // Filter out ordered items - only process active items
    const activeItems = cart.items.filter(item => item.status !== 'ordered');
    if (activeItems.length === 0) {
      return res.status(400).json({ msg: 'No active items in cart' });
    }

    const products = activeItems.map((item) => ({ productId: item.product._id.toString(), quantity: item.quantity }));

    // NGN/USD rate for conversion (keep in sync with frontend/SeerBit)
    const NGN_PER_USD = 1500;

    // Calculate total amount - all values in order currency (no mixing USD and NGN)
    let subTotalInOrderCurrency = 0;
    for (const item of activeItems) {
      const productCurrency = item.product.currency === 'USDT' ? 'USDC' : (item.product.currency || 'USDC');
      let itemPriceInOrderCurrency = item.product.price;
      if (productCurrency !== currency) {
        if (productCurrency === 'NGN' && (currency === 'USDC' || currency === 'USD')) {
          itemPriceInOrderCurrency = item.product.price / NGN_PER_USD;
        } else if ((productCurrency === 'USDC' || productCurrency === 'USD') && currency === 'NGN') {
          itemPriceInOrderCurrency = item.product.price * NGN_PER_USD;
        }
      }
      subTotalInOrderCurrency += itemPriceInOrderCurrency * item.quantity;
    }

    // Get delivery method
    const deliveryMethod = await DeliveryMethod.findById(deliveryMethodId);
    if (!deliveryMethod) {
      return res.status(400).json({ msg: 'Invalid delivery method' });
    }

    // Convert delivery fee to order currency so totalAmount is in one currency
    let deliveryFeeInOrderCurrency = deliveryMethod.price;
    const dmCurrency = deliveryMethod.currency || 'USD';
    if (dmCurrency !== currency) {
      if (dmCurrency === 'NGN' && (currency === 'USDC' || currency === 'USD')) {
        deliveryFeeInOrderCurrency = deliveryMethod.price / NGN_PER_USD;
      } else if ((dmCurrency === 'USDC' || dmCurrency === 'USD') && currency === 'NGN') {
        deliveryFeeInOrderCurrency = deliveryMethod.price * NGN_PER_USD;
      }
    }
    const totalAmount = subTotalInOrderCurrency + deliveryFeeInOrderCurrency;

    // Handle different payment methods
    if (paymentMethod === 'paystack') {
      // For Paystack payments, create order with pending status
      const orderData = {
        buyer: req.user.id,
        products: cart.items.map(item => ({
          product: item.product._id,
          quantity: item.quantity,
          price: item.product.price
        })),
        subTotal: subTotalInOrderCurrency,
        deliveryMethod: deliveryMethodId,
        deliveryFee: deliveryFeeInOrderCurrency,
        totalAmount,
        status: 'pending_payment',
        paymentMethod: 'paystack',
        currency,
        notes,
        shippingAddressId
      };

      const order = new Order(orderData);
      await order.save();

      // Initialize Paystack transaction
      const paystackReference = PaystackService.generateReference();
      const paystackAmount = PaystackService.convertToKobo(totalAmount, 'NGN'); // Convert to NGN for Paystack

      const paystackResponse = await PaystackService.initializeTransaction({
        email: req.user.email,
        amount: paystackAmount,
        reference: paystackReference,
        currency: 'NGN',
        metadata: {
          orderId: order._id.toString(),
          userId: req.user.id,
          originalCurrency: currency,
          originalAmount: totalAmount
        }
      });

      // Update order with Paystack reference and mark as pending payment
      order.paystackReference = paystackReference;
      order.status = 'pending_payment';
      order.paymentStatus = 'pending';
      await order.save();

      // Ensure order _id is a string
      const orderObj = order.toObject();
      orderObj._id = orderObj._id.toString();
      
      return res.json({
        order: orderObj,
        paystackData: {
          authorization_url: paystackResponse.data.authorization_url,
          access_code: paystackResponse.data.access_code,
          reference: paystackReference
        },
        orderId: orderObj._id // Explicitly include orderId for frontend
      });
    } else if (paymentMethod === 'seerbit') {
      // SeerBit Standard Checkout: create order, initialize payment, return redirect link
      const orderData = {
        buyer: req.user.id,
        products: cart.items.map(item => ({
          product: item.product._id,
          quantity: item.quantity,
          price: item.product.price
        })),
        subTotal: subTotalInOrderCurrency,
        deliveryMethod: deliveryMethodId,
        deliveryFee: deliveryFeeInOrderCurrency,
        totalAmount,
        status: 'pending',
        paymentMethod: 'seerbit',
        paymentStatus: 'unpaid',
        currency,
        notes,
        shippingAddress: shippingAddressId || null
      };
      const order = new Order(orderData);
      await order.save();

      const seerbitReference = seerbitService.generateReference();
      // totalAmount is already in order currency; SeerBit expects NGN in whole units
      const amountInNGN = currency === 'NGN' ? totalAmount : totalAmount * NGN_PER_USD;
      const amountForSeerbit = String(Math.round(amountInNGN));
      if (process.env.NODE_ENV !== 'production') {
        console.log('[SeerBit] amount', { subTotalInOrderCurrency, deliveryFeeInOrderCurrency, totalAmount, currency, amountInNGN, amountForSeerbit });
      }
      const callbackUrl = process.env.FRONTEND_URL
        ? `${process.env.FRONTEND_URL.replace(/\/$/, '')}/checkout/success?reference=${encodeURIComponent(seerbitReference)}`
        : `${req.protocol}://${req.get('host')}/api/orders/seerbit/callback?reference=${encodeURIComponent(seerbitReference)}`;

      const seerbitResult = await seerbitService.initializePayment({
        publicKey: process.env.SEERBIT_PUBLIC_KEY,
        amount: amountForSeerbit,
        currency: 'NGN',
        country: 'NG',
        paymentReference: seerbitReference,
        email: req.user.email,
        fullName: req.user.name || req.user.email,
        callbackUrl
      });

      order.seerbitReference = seerbitReference;
      order.paymentReference = seerbitReference;
      order.status = 'pending';
      await order.save();

      const orderObj = order.toObject();
      orderObj._id = orderObj._id.toString();

      return res.json({
        order: orderObj,
        seerbitData: {
          redirectLink: seerbitResult.redirectLink,
          reference: seerbitReference
        },
        orderId: orderObj._id
      });
    } else if (paymentMethod === 'paystack') {
      // For Paystack payments, verify payment first, then create/update order
      const { paystackReference } = req.body;

      if (!paystackReference) {
        return res.status(400).json({ msg: 'Paystack reference is required' });
      }

      try {
        // Verify payment with Paystack SDK
        const verification = await Paystack.transaction.verify({ reference: paystackReference });

        if (!verification.status || verification.data.status !== 'success') {
          return res.status(400).json({ msg: 'Payment verification failed' });
        }

        // Check if order already exists for this reference
        let existingOrder = await Order.findOne({ paystackReference });

        if (existingOrder) {
          // Update existing order status
          existingOrder.status = 'confirmed';
          existingOrder.paymentStatus = 'paid';
          existingOrder.paymentReference = paystackReference;
          await existingOrder.save();

          // Mark cart items as ordered
          const cart = await Cart.findOne({ user: existingOrder.buyer });
          if (cart) {
            cart.items = cart.items.map(item => ({
              ...item.toObject(),
              status: 'ordered'
            }));
            await cart.save();
          }

          // Award referral bonus
          if (existingOrder.buyer.referredBy) {
            await awardReferralBonus(existingOrder.buyer, existingOrder.totalAmount);
          }

          const populatedOrder = await Order.findById(existingOrder._id)
            .populate({
              path: 'items',
              populate: {
                path: 'product',
                select: 'name price images'
              }
            })
            .populate('buyer', ['name', 'email', 'walletAddress']);

          const orderObj = populatedOrder.toObject();
          orderObj._id = orderObj._id.toString();

          return res.json({
            ...orderObj,
            orderId: orderObj._id,
            message: 'Order payment confirmed successfully'
          });
        } else {
          // Create new order with verified payment
          const orderData = {
            buyer: req.user.id,
            products: cart.items.map(item => ({
              product: item.product._id,
              quantity: item.quantity,
              price: item.product.price
            })),
            subTotal: subTotalUSD,
            deliveryMethod: deliveryMethodId,
            deliveryFee: deliveryMethod.price,
            totalAmount,
            status: 'confirmed',
            paymentMethod: 'paystack',
            paymentStatus: 'paid',
            paystackReference,
            paymentReference: paystackReference,
            currency,
            notes,
            shippingAddressId
          };

          const order = new Order(orderData);
          const savedOrder = await order.save();

          // Mark cart items as ordered
          cart.items = cart.items.map(item => ({
            ...item.toObject(),
            status: 'ordered'
          }));
    await cart.save();

          // Award referral bonus
          if (req.user.referredBy) {
            await awardReferralBonus(req.user.id, totalAmount);
          }

          const populatedOrder = await Order.findById(savedOrder._id)
            .populate({
              path: 'items',
              populate: {
                path: 'product',
                select: 'name price images'
              }
            })
            .populate('buyer', ['name', 'email', 'walletAddress']);

          const orderObj = populatedOrder.toObject();
          orderObj._id = orderObj._id.toString();

          return res.json({
            ...orderObj,
            orderId: orderObj._id,
            message: 'Order created and payment confirmed successfully'
          });
        }
      } catch (error) {
        console.error('Paystack verification error:', error);
        return res.status(500).json({ msg: 'Payment verification failed', error: error.message });
      }
    } else {
      // For wallet payments, create order directly
      const orderData = {
        buyer: req.user.id,
        products: cart.items.map(item => ({
          product: item.product._id,
          quantity: item.quantity,
          price: item.product.price
        })),
        subTotal: subTotalUSD,
        deliveryMethod: deliveryMethodId,
        deliveryFee: deliveryMethod.price,
        totalAmount,
        status: 'confirmed', // Wallet payments are immediately paid
        paymentMethod: 'wallet',
        paymentStatus: 'paid',
        currency,
        notes,
        shippingAddressId,
        walletAddress
      };

      const order = new Order(orderData);
      const savedOrder = await order.save();

      // Populate product details for response
      const populatedOrder = await Order.findById(savedOrder._id)
        .populate({
          path: 'items',
          populate: {
            path: 'product',
            select: 'name price images'
          }
        })
        .populate('buyer', ['name', 'email', 'walletAddress']);

      // Mark cart items as ordered instead of clearing them
      console.log('Marking cart items as ordered for user:', req.user.id, 'Cart items before update:', cart.items.length);
      cart.items = cart.items.map(item => ({
        ...item.toObject(),
        status: 'ordered'
      }));
      await cart.save();
      console.log('Cart items marked as ordered for user:', req.user.id);

      // Award referral bonus if applicable
      if (req.user.referredBy) {
        await awardReferralBonus(req.user.id, totalAmount);
      }

      const orderObj = populatedOrder.toObject();
      // Ensure _id is a string
      orderObj._id = orderObj._id.toString();

      return res.json({
        ...orderObj,
        orderId: orderObj._id, // Explicitly include orderId for frontend
        message: 'Order created successfully'
      });
    }
  } catch (err) {
    console.error('Checkout error:', err.message);
    res.status(500).json({ msg: 'Server Error', error: err.message });
  }
};

// @desc    Handle Paystack webhook for payment verification
// @route   POST /api/orders/paystack/webhook
// @access  Public (webhook)
const handlePaystackWebhook = async (req, res) => {
  try {
    const { event, data } = req.body;

    if (event === 'charge.success') {
      const { reference } = data;
      
      // Verify the transaction with Paystack
      const verificationResponse = await PaystackService.verifyTransaction(reference);
      
      if (verificationResponse.data.status === 'success') {
        // Find the order by Paystack reference
        const order = await Order.findOne({ paystackReference: reference });
        
        if (order && order.status === 'pending_payment') {
          // Update order status to paid
          order.status = 'confirmed';
          order.paymentStatus = 'paid';
          order.paymentReference = reference;
          await order.save();

          console.log(`Order ${order._id} payment confirmed via Paystack webhook`);

          // Mark cart items as ordered instead of clearing them
          const cart = await Cart.findOne({ user: order.buyer });
          if (cart) {
            console.log('Marking cart items as ordered for user:', order.buyer, 'Cart items before update:', cart.items.length);
            cart.items = cart.items.map(item => ({
              ...item.toObject(),
              status: 'ordered'
            }));
            await cart.save();
            console.log('Cart items marked as ordered for user:', order.buyer);
          } else {
            console.log('No cart found for user:', order.buyer);
          }

          // Award referral bonus if applicable
          try {
            await awardReferralBonus(order.buyer, order.totalAmount);
          } catch (referralError) {
            console.error('Referral bonus error:', referralError);
            // Don't fail the order for referral errors
          }
        }
      }
    }

    res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Paystack webhook error:', error);
    res.status(400).json({ status: 'error', message: error.message });
  }
};

// @desc    Get all orders for a user
// @route   GET /api/orders
// @access  Private
const getOrders = async (req, res) => {
  try {
    console.log('Fetching orders for user:', req.user.id);

    // Get category filter from query params
    const { category = 'all' } = req.query;

    // Build filter query based on category
    let statusFilter = {};
    if (category && category !== 'all') {
      switch (category) {
        case 'to-be-received':
          statusFilter = { status: { $in: ['pending', 'confirmed', 'processing', 'shipped'] } };
          break;
        case 'completed':
          statusFilter = { status: 'delivered' };
          break;
        case 'cancelled':
          statusFilter = { status: { $in: ['cancelled', 'refunded'] } };
          break;
        default:
          // For specific status values, filter by exact match
          statusFilter = { status: category };
      }
    }

    const filter = {
      buyer: req.user.id,
      ...statusFilter
    };

    // Find orders using the new schema structure
    const orders = await Order.find(filter)
      .populate({
        path: 'items',
        populate: {
          path: 'product',
          select: 'name price images'
        }
      })
      .populate('buyer', ['name', 'email', 'walletAddress'])
      .populate('shippingAddress')
      .populate('deliveryMethod')
      .populate('payments')
      .sort({ orderDate: -1 });

    // Debug logging to see the actual data structure
    if (orders.length > 0) {
      console.log('getOrders - First order structure:', JSON.stringify(orders[0], null, 2));
    }

    // Ensure all order IDs are strings and manually populate product data if needed
    const ordersWithStringIds = await Promise.all(orders.map(async (order) => {
      const orderObj = order.toObject();
      orderObj._id = orderObj._id.toString();

      // Flatten shipping address data for frontend compatibility
      if (orderObj.shippingAddress) {
        orderObj.shipping = {
          name: `${orderObj.shippingAddress.firstName} ${orderObj.shippingAddress.lastName}`,
          email: orderObj.shippingAddress.email,
          phone: `${orderObj.shippingAddress.areaNumber}${orderObj.shippingAddress.phoneNumber}`,
          address: orderObj.shippingAddress.streetAddress
        };
      }

      // Flatten delivery method data for frontend compatibility
      if (orderObj.deliveryMethod) {
        orderObj.delivery = {
          method: orderObj.deliveryMethod.name,
          timeframe: orderObj.deliveryMethod.estimatedDeliveryTime
        };
      }

      // Flatten pricing data for frontend compatibility
      orderObj.pricing = {
        subtotal: orderObj.subTotal,
        delivery: orderObj.deliveryFee,
        total: orderObj.calculatedTotal || orderObj.totalAmount
      };

      // Ensure all items have unitPrice and process items for frontend
      if (orderObj.items && orderObj.items.length > 0) {
        // Process all items to ensure unitPrice is available and product.price reflects unitPrice
        orderObj.items = orderObj.items.map(item => {
          const itemObj = item.toObject ? item.toObject() : item;
          // Ensure unitPrice is set (it should be from OrderItem schema)
          if (!itemObj.unitPrice && itemObj.price) {
            itemObj.unitPrice = itemObj.price;
          }
          // Ensure product.price reflects unitPrice if variant is selected (for frontend compatibility)
          if (itemObj.product && itemObj.unitPrice) {
            itemObj.product.price = itemObj.unitPrice;
          }
          return itemObj;
        });
        
        // Flatten product data for frontend compatibility (first item for legacy support)
        const firstItem = orderObj.items[0];
        orderObj.product = {
          name: firstItem.productName || firstItem.product?.name || 'Product',
          variant: firstItem.variant?.name || '',
          quantity: firstItem.quantity,
          price: firstItem.unitPrice || firstItem.price,
          unitPrice: firstItem.unitPrice || firstItem.price,
          images: firstItem.product?.images || []
        };
      }

      // Check if product data is incomplete and manually populate if needed
      if (orderObj.items && orderObj.items.length > 0) {
        for (let item of orderObj.items) {
          if (item.product && (!item.product.images || item.product.images.length === 0 || !item.product.hasOwnProperty('images'))) {
            try {
              // Manually fetch the product with full data
              const Product = require('../models/Product');
              const fullProduct = await Product.findById(item.product._id).lean();
              console.log('Manual population - fetched product:', {
                id: fullProduct?._id,
                name: fullProduct?.name,
                hasImages: !!fullProduct?.images,
                imagesLength: fullProduct?.images?.length || 0,
                images: fullProduct?.images
              });
              if (fullProduct) {
                item.product = {
                  ...item.product,
                  images: fullProduct.images && fullProduct.images.length > 0 ? fullProduct.images : ['/images/desktop-1.png'],
                  variants: fullProduct.variants || [],
                  firstImage: fullProduct.images && fullProduct.images.length > 0 ? fullProduct.images[0] : '/images/desktop-1.png'
                };
                console.log('Manually populated product:', item.product._id, 'with images:', item.product.images?.length || 0);
              }
            } catch (error) {
              console.error('Error manually populating product:', error);
            }
          }
        }
      }

      return orderObj;
    }));

    // Final fallback - ensure all products have images
    ordersWithStringIds.forEach(order => {
      if (order.items && order.items.length > 0) {
        order.items.forEach(item => {
          if (item.product && (!item.product.images || item.product.images.length === 0)) {
            item.product.images = ['/images/desktop-1.png'];
            item.product.firstImage = '/images/desktop-1.png';
            console.log('Final fallback - added placeholder image for product:', item.product._id);
          }
        });
      }
    });

    console.log(`Found ${ordersWithStringIds.length} orders for user`);
    res.json(ordersWithStringIds);
  } catch (err) {
    console.error('Error fetching orders:', err.message);
    console.error('Error stack:', err.stack);
    res.status(500).json({ msg: 'Server Error', error: err.message });
  }
};

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
const getOrderById = async (req, res) => {
  try {
    console.log('Fetching order by ID:', req.params.id);
    
    // First try to find the order without population to see its structure
    const rawOrder = await Order.findById(req.params.id);
    if (!rawOrder) {
      return res.status(404).json({ msg: 'Order not found' });
    }

    console.log('Raw order structure:', {
      hasUser: !!rawOrder.user,
      hasBuyer: !!rawOrder.buyer,
      hasItems: !!rawOrder.items,
      hasProducts: !!rawOrder.products,
      itemsLength: rawOrder.items ? rawOrder.items.length : 0,
      productsLength: rawOrder.products ? rawOrder.products.length : 0,
      orderKeys: Object.keys(rawOrder.toObject())
    });

    // Try to populate based on the order structure
    let order;

    // Populate using the new schema structure
    order = await Order.findById(req.params.id)
      .populate({
        path: 'items',
        populate: {
          path: 'product',
          select: 'name price images'
        }
      })
      .populate('buyer', ['name', 'email', 'walletAddress'])
      .populate('shippingAddress')
      .populate('deliveryMethod')
      .populate('payments');

    if (!order) {
      return res.status(404).json({ msg: 'Order not found' });
    }

    // Check ownership
    const orderOwnerId = order.buyer?._id || order.buyer;
    if (!orderOwnerId) {
      console.error('No buyer found in order:', order._id);
      return res.status(500).json({ msg: 'Invalid order structure' });
    }

    // Convert to string for comparison
    const ownerIdString = orderOwnerId.toString();
    if (ownerIdString !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Access denied' });
    }

    // Ensure _id is a string for consistency
    const orderObj = order.toObject();
    orderObj._id = orderObj._id.toString();

    // Flatten shipping address data for frontend compatibility
    if (orderObj.shippingAddress) {
      orderObj.shipping = {
        name: `${orderObj.shippingAddress.firstName} ${orderObj.shippingAddress.lastName}`,
        email: orderObj.shippingAddress.email,
        phone: `${orderObj.shippingAddress.areaNumber}${orderObj.shippingAddress.phoneNumber}`,
        address: orderObj.shippingAddress.streetAddress
      };
    }

    // Flatten delivery method data for frontend compatibility
    if (orderObj.deliveryMethod) {
      orderObj.delivery = {
        method: orderObj.deliveryMethod.name,
        timeframe: orderObj.deliveryMethod.estimatedDeliveryTime
      };
    }

    // Flatten pricing data for frontend compatibility
    orderObj.pricing = {
      subtotal: orderObj.subTotal,
      delivery: orderObj.deliveryFee,
      total: orderObj.calculatedTotal || orderObj.totalAmount
    };

    // Ensure all items have unitPrice and process items for frontend
    if (orderObj.items && orderObj.items.length > 0) {
      // Process all items to ensure unitPrice is available and product.price reflects unitPrice
      orderObj.items = orderObj.items.map(item => {
        const itemObj = item.toObject ? item.toObject() : item;
        // Ensure unitPrice is set (it should be from OrderItem schema)
        if (!itemObj.unitPrice && itemObj.price) {
          itemObj.unitPrice = itemObj.price;
        }
        // Ensure product.price reflects unitPrice if variant is selected (for frontend compatibility)
        if (itemObj.product && itemObj.unitPrice) {
          itemObj.product.price = itemObj.unitPrice;
        }
        return itemObj;
      });
      
      // Flatten product data for frontend compatibility (first item for legacy support)
      const firstItem = orderObj.items[0];
      orderObj.product = {
        name: firstItem.productName || firstItem.product?.name || 'Product',
        variant: firstItem.variant?.name || '',
        quantity: firstItem.quantity,
        price: firstItem.unitPrice || firstItem.price,
        unitPrice: firstItem.unitPrice || firstItem.price,
        images: firstItem.product?.images || []
      };
    }

    // Add order stages mapping
    const orderStages = [
      { id: 1, name: "Submit Order", rank: 1 },
      { id: 2, name: "Waiting for Delivery", rank: 2 },
      { id: 3, name: "Out for delivery", rank: 3 },
      { id: 4, name: "Transaction Complete", rank: 4 }
    ];

    // Determine current stage based on status
    let currentStage = 1; // Default to first stage
    switch (orderObj.status) {
      case 'confirmed':
      case 'processing':
        currentStage = 2;
        break;
      case 'shipped':
        currentStage = 3;
        break;
      case 'delivered':
        currentStage = 4;
        break;
      default:
        currentStage = 1;
    }

    orderObj.currentStage = currentStage;
    orderObj.stages = orderStages.map(stage => ({
      ...stage,
      completed: stage.rank <= currentStage,
      active: stage.rank === currentStage
    }));

    console.log('Successfully fetched order:', orderObj._id);
    res.json(orderObj);
  } catch (err) {
    console.error('Error fetching order by ID:', err.message);
    console.error('Error stack:', err.stack);
    console.error('Order ID:', req.params.id);
    res.status(500).json({ msg: 'Server Error', error: err.message });
  }
};

// @desc    Get order by order number
// @route   GET /api/orders/by-number/:orderNumber
// @access  Private
const getOrderByNumber = async (req, res) => {
  try {
    console.log('Fetching order by number:', req.params.orderNumber);
    
    // Find order by order number
    const rawOrder = await Order.findOne({ orderNumber: req.params.orderNumber });
    if (!rawOrder) {
      return res.status(404).json({ msg: 'Order not found' });
    }

    console.log('Raw order structure:', {
      hasUser: !!rawOrder.user,
      hasBuyer: !!rawOrder.buyer,
      hasItems: !!rawOrder.items,
      hasProducts: !!rawOrder.products,
      itemsLength: rawOrder.items ? rawOrder.items.length : 0,
      productsLength: rawOrder.products ? rawOrder.products.length : 0,
      orderKeys: Object.keys(rawOrder.toObject())
    });

    // Try to populate based on the order structure
    let order;

    // Populate using the new schema structure
    order = await Order.findOne({ orderNumber: req.params.orderNumber })
      .populate({
        path: 'items',
        populate: {
          path: 'product',
          select: 'name price images'
        }
      })
      .populate('buyer', ['name', 'email', 'walletAddress'])
      .populate('shippingAddress')
      .populate('deliveryMethod')
      .populate('payments');

    if (!order) {
      return res.status(404).json({ msg: 'Order not found' });
    }

    // Check ownership
    const orderOwnerId = order.buyer?._id || order.buyer;
    if (!orderOwnerId) {
      console.error('No buyer found in order:', order._id);
      return res.status(500).json({ msg: 'Invalid order structure' });
    }

    // Convert to string for comparison
    const ownerIdString = orderOwnerId.toString();
    if (ownerIdString !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Access denied' });
    }

    // Ensure _id is a string for consistency
    const orderObj = order.toObject();
    orderObj._id = orderObj._id.toString();

    // Flatten shipping address data for frontend compatibility
    if (orderObj.shippingAddress) {
      orderObj.shipping = {
        name: `${orderObj.shippingAddress.firstName} ${orderObj.shippingAddress.lastName}`,
        email: orderObj.shippingAddress.email,
        phone: `${orderObj.shippingAddress.areaNumber}${orderObj.shippingAddress.phoneNumber}`,
        address: orderObj.shippingAddress.streetAddress
      };
    }

    // Flatten delivery method data for frontend compatibility
    if (orderObj.deliveryMethod) {
      orderObj.delivery = {
        method: orderObj.deliveryMethod.name,
        timeframe: orderObj.deliveryMethod.estimatedDeliveryTime
      };
    }

    // Flatten pricing data for frontend compatibility
    orderObj.pricing = {
      subtotal: orderObj.subTotal,
      delivery: orderObj.deliveryFee,
      total: orderObj.calculatedTotal || orderObj.totalAmount
    };

    // Flatten product data for frontend compatibility
    if (orderObj.items && orderObj.items.length > 0) {
      const firstItem = orderObj.items[0];
      orderObj.product = {
        name: firstItem.productName || firstItem.product?.name || 'Product',
        variant: firstItem.variant?.name || '',
        quantity: firstItem.quantity,
        price: firstItem.unitPrice,
        images: firstItem.product?.images || []
      };
    }

    console.log('Successfully fetched order by number:', orderObj.orderNumber);
    res.json(orderObj);
  } catch (err) {
    console.error('Error fetching order by number:', err.message);
    console.error('Error stack:', err.stack);
    console.error('Order number:', req.params.orderNumber);
    res.status(500).json({ msg: 'Server Error', error: err.message });
  }
};

// @desc    Update order status (admin or owner)
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
      .populate({
        path: 'items',
        populate: {
          path: 'product',
          select: 'name price images'
        }
      })
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

// @desc    Admin: list all orders
// @route   GET /api/admin/orders
// @access  Private (admin)
const adminListOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate({
        path: 'items',
        populate: {
          path: 'product',
          select: 'name price images currency variants'
        }
      })
      .populate('buyer', ['name', 'email', 'walletAddress'])
      .populate('deliveryMethod', ['name', 'price', 'currency'])
      .sort({ createdAt: -1 }); // Use createdAt instead of orderDate

    // Ensure all order IDs are strings and fix product images
    const ordersWithStringIds = orders.map(order => {
      const orderObj = order.toObject();
      orderObj._id = orderObj._id.toString();
      
      // Ensure all items have product images - fallback to stored productImage or placeholder
      if (orderObj.items && orderObj.items.length > 0) {
        for (let item of orderObj.items) {
          // If product is populated but missing images, use stored productImage or placeholder
          if (item.product) {
            if (!item.product.images || item.product.images.length === 0) {
              item.product.images = item.productImage ? [item.productImage] : ['/images/desktop-1.png'];
            }
            // Ensure product name is available
            if (!item.product.name && item.productName) {
              item.product.name = item.productName;
            }
          } else {
            // If product is not populated, create a minimal product object from stored data
            item.product = {
              _id: item.product || 'unknown',
              name: item.productName || 'Product',
              images: item.productImage ? [item.productImage] : ['/images/desktop-1.png'],
              price: item.unitPrice,
              currency: item.currency
            };
          }
        }
      }
      
      return orderObj;
    });

    console.log('Total orders found:', ordersWithStringIds.length);
    if (ordersWithStringIds.length > 0) {
      console.log('First order items count:', ordersWithStringIds[0].items?.length || 0);
      if (ordersWithStringIds[0].items?.length > 0) {
        console.log('First order first item images:', ordersWithStringIds[0].items[0].product?.images);
      }
    }

    res.json(ordersWithStringIds);
  } catch (err) {
    console.error('Error fetching admin orders:', err.message);
    res.status(500).json({ msg: 'Server Error', error: err.message });
  }
};

// @desc    Admin: get order by id
// @route   GET /api/admin/orders/:id
// @access  Private (admin)
const adminGetOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate({
        path: 'items',
        populate: {
          path: 'product',
          select: 'name price images currency variants'
        }
      })
      .populate('buyer', ['name', 'email', 'walletAddress'])
      .populate('shippingAddress')
      .populate('deliveryMethod', ['name', 'price', 'currency']);
    
    if (!order) {
      return res.status(404).json({ msg: 'Order not found' });
    }

    // Ensure _id is a string
    const orderObj = order.toObject();
    orderObj._id = orderObj._id.toString();

    // Ensure all items have product images - fallback to stored productImage or placeholder
    if (orderObj.items && orderObj.items.length > 0) {
      for (let item of orderObj.items) {
        // If product is populated but missing images, use stored productImage or placeholder
        if (item.product) {
          if (!item.product.images || item.product.images.length === 0) {
            item.product.images = item.productImage ? [item.productImage] : ['/images/desktop-1.png'];
          }
          // Ensure product name is available
          if (!item.product.name && item.productName) {
            item.product.name = item.productName;
          }
        } else {
          // If product is not populated, create a minimal product object from stored data
          item.product = {
            _id: item.product || 'unknown',
            name: item.productName || 'Product',
            images: item.productImage ? [item.productImage] : ['/images/desktop-1.png'],
            price: item.unitPrice,
            currency: item.currency
          };
        }
      }
    }

    // Log for debugging
    console.log('Order items count:', orderObj.items?.length || 0);
    if (orderObj.items && orderObj.items.length > 0) {
      console.log('First item product images:', orderObj.items[0].product?.images);
      console.log('First item productImage:', orderObj.items[0].productImage);
    }

    res.json(orderObj);
  } catch (err) {
    console.error('Error fetching admin order by ID:', err.message);
    res.status(500).json({ msg: 'Server Error', error: err.message });
  }
};

// @desc    Admin: update order (status, tracking, delivery method, shipping address)
// @route   PUT /api/admin/orders/:id
// @access  Private (admin)
const adminUpdateOrder = async (req, res) => {
  try {
    const { status, trackingNumber, deliveryMethodId, shippingAddress } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ msg: 'Order not found' });

    const previousStatus = order.status;

    if (status) {
      const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
      const statusLower = status.toLowerCase();
      if (!validStatuses.includes(statusLower)) {
        return res.status(400).json({ msg: 'Invalid order status' });
      }
      order.status = statusLower;
      
      // Reduce stock when order is marked as delivered
      if (statusLower === 'delivered' && previousStatus !== 'delivered') {
        try {
          // Populate order items to get product and variant info
          await order.populate({
            path: 'items',
            select: 'product variant quantity'
          });
          
          // Reduce stock for each item
          for (const item of order.items) {
            const variantId = item.variant?.variantId || item.variant?.name || null;
            await reduceStockOnOrder(item.product, variantId, item.quantity);
          }
        } catch (stockError) {
          console.error('Error reducing stock on order delivery:', stockError);
          // Don't fail the order update if stock reduction fails, just log it
        }
      }
    }

    if (trackingNumber !== undefined) {
      order.trackingNumber = trackingNumber;
    }

    if (deliveryMethodId) {
      const method = await DeliveryMethod.findById(deliveryMethodId);
      if (!method) return res.status(400).json({ msg: 'Invalid delivery method' });
      order.deliveryMethod = method._id;
      order.deliveryFee = method.price || 0;
      order.totalAmount = (order.subTotal || 0) + order.deliveryFee;
    }

    if (shippingAddress) {
      order.shippingAddress = shippingAddress;
    }

    await order.save();

    const updated = await Order.findById(order._id)
      .populate({
        path: 'items',
        populate: {
          path: 'product',
          select: 'name price images'
        }
      })
      .populate('buyer', ['name', 'email', 'walletAddress'])
      .populate('deliveryMethod');
    res.json(updated);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Get order by Paystack reference
// @route   GET /api/orders/by-reference/:reference
// @access  Private
const getOrderByPaystackReference = async (req, res) => {
  try {
    const { reference } = req.params;

    const order = await Order.findOne({
      $or: [
        { paystackReference: reference },
        { seerbitReference: reference },
        { paymentReference: reference }
      ],
      buyer: req.user.id // Ensure user owns this order
    })
      .populate({
        path: 'items',
        populate: {
          path: 'product',
          select: 'name price images'
        }
      })
      .populate('buyer', ['name', 'email', 'walletAddress']);

    if (!order) {
      return res.status(404).json({ msg: 'Order not found' });
    }

    res.json(order);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Verify payment and create/update order
// @route   POST /api/orders/verify-payment
// @access  Private
const verifyPaymentAndCreateOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  let transactionCommitted = false;

  const userId = (req.user && (req.user._id || req.user.id))?.toString?.() || req.user?.id;
  if (!userId) {
    session.endSession();
    return res.status(401).json({ msg: 'Authentication required' });
  }

  try {
    const {
      paymentMethod,
      paystackReference,
      seerbitReference,
      deliveryMethodId,
      shippingAddressId,
      currency = 'USDC',
      notes = ''
    } = req.body;

    // Get user's cart
    let cart = await Cart.findOne({ user: userId }).populate('items.product', ['price', 'images', 'currency', 'name']).session(session);
    if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ msg: 'Cart is empty' });
    }

    // Filter out ordered items - only process active items
    let activeItems = cart.items.filter(item => item.status !== 'ordered');

    // SeerBit: order was already created at checkout; find it and confirm with order items from cart
    if (paymentMethod === 'seerbit' && seerbitReference) {
      const refStr = typeof seerbitReference === 'string' ? seerbitReference : seerbitReference?.reference;
      if (!refStr) {
        await session.abortTransaction();
        return res.status(400).json({ msg: 'SeerBit reference is required' });
      }
      const existingOrder = await Order.findOne({ seerbitReference: refStr, buyer: userId }).session(session);
      if (!existingOrder) {
        await session.abortTransaction();
        return res.status(404).json({ msg: 'Order not found for this payment' });
      }
      // Verify payment status with SeerBit backend before confirming order
      let seerbitVerification;
      try {
        seerbitVerification = await seerbitService.verifyPayment(refStr);
      } catch (err) {
        await session.abortTransaction();
        return res.status(502).json({ msg: 'Could not verify payment with SeerBit', error: err.message });
      }
      if (!seerbitVerification || !seerbitVerification.success) {
        await session.abortTransaction();
        return res.status(400).json({ msg: seerbitVerification?.message || 'Payment not confirmed by SeerBit' });
      }
      if (activeItems.length === 0) {
        await session.abortTransaction();
        return res.status(400).json({ msg: 'No active items in cart' });
      }
      const orderCurrency = existingOrder.currency || 'NGN';
      const orderItems = [];
      for (const cartItem of activeItems) {
        const product = cartItem.product;
        const productId = product && (product._id || product);
        if (!productId) continue;
        let variantData;
        if (cartItem.variant && typeof cartItem.variant === 'object') {
          variantData = {
            variantId: cartItem.variant._id || cartItem.variant.variantId || null,
            name: cartItem.variant.name || null,
            attributes: cartItem.variant.attributes || [],
            additionalPrice: cartItem.variant.additionalPrice || cartItem.variant.price || 0
          };
        }
        const unitPrice = cartItem.unitPrice ?? (product && product.price);
        const totalPrice = (unitPrice || 0) * (cartItem.quantity || 0);
        const orderItemData = {
          order: existingOrder._id,
          product: productId,
          specs: cartItem.specs && Array.isArray(cartItem.specs) ? cartItem.specs : [],
          quantity: cartItem.quantity,
          unitPrice: unitPrice || 0,
          totalPrice,
          currency: (cartItem.currency || product?.currency || orderCurrency) === 'USDT' ? 'USDC' : (cartItem.currency || product?.currency || orderCurrency),
          status: 'ordered',
          productImage: (product && product.images && product.images.length > 0) ? product.images[0] : '/images/desktop-1.png',
          productName: (product && product.name) || ''
        };
        if (variantData) orderItemData.variant = variantData;
        const orderItem = new OrderItem(orderItemData);
        await orderItem.save({ session });
        orderItems.push(orderItem._id);
      }
      if (orderItems.length === 0) {
        await session.abortTransaction();
        return res.status(400).json({ msg: 'No valid cart items to confirm (missing product?)' });
      }
      existingOrder.items = orderItems;
      existingOrder.status = 'confirmed';
      existingOrder.paymentStatus = 'paid';
      existingOrder.paymentReference = refStr;
      await existingOrder.save({ session });

      const payment = new Payment({
        order: existingOrder._id,
        user: req.user.id,
        amount: existingOrder.totalAmount,
        currency: existingOrder.currency,
        method: 'seerbit',
        status: 'completed',
        paymentDate: new Date(),
        reference: refStr,
        seerbitReference: refStr
      });
      await payment.save({ session });
      existingOrder.payments = [payment._id];
      await existingOrder.save({ session });

      const orderedProductIds = new Set(activeItems.map(a => (a.productId || (a.product && (a.product._id || a.product)))?.toString()).filter(Boolean));
      cart.items = (cart.items || []).map(item => {
        const itemObj = item.toObject ? item.toObject() : { ...item };
        const pid = (item.productId || (item.product && (item.product._id || item.product)))?.toString();
        if (pid && orderedProductIds.has(pid)) itemObj.status = 'ordered';
        return itemObj;
      });
      await cart.save({ session });

      if (req.user && req.user.referredBy) {
        await awardReferralBonus(userId, existingOrder.totalAmount);
      }

      await session.commitTransaction();
      transactionCommitted = true;

      const orderObj = existingOrder.toObject();
      orderObj._id = orderObj._id.toString();
      return res.json({
        _id: orderObj._id,
        orderNumber: orderObj.orderNumber,
        status: orderObj.status,
        paymentStatus: orderObj.paymentStatus,
        totalAmount: orderObj.totalAmount,
        currency: orderObj.currency,
        paymentMethod: orderObj.paymentMethod,
        createdAt: orderObj.createdAt,
        orderId: orderObj._id,
        message: 'Order created and payment confirmed successfully'
      });
    }

    if (activeItems.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ msg: 'No active items in cart' });
    }

    // Calculate totals - convert all prices to order currency before summing
    let subTotal = 0;
    for (const item of activeItems) {
      // Convert item price to order currency if different
      let itemPrice = item.product.price;
      if (item.product.currency && item.product.currency !== currency) {
        // For now, assume USDC/USD are 1:1, and NGN conversion
        if (item.product.currency === 'NGN' && currency === 'USDC') {
          itemPrice = item.product.price / 1500; // Convert NGN to USDC
        } else if (item.product.currency === 'USDC' && currency === 'NGN') {
          itemPrice = item.product.price * 1500; // Convert USDC to NGN
        }
        // Add more conversion logic as needed for other currencies
      }
      subTotal += itemPrice * item.quantity;
    }

    // Get delivery method
    const deliveryMethod = await DeliveryMethod.findById(deliveryMethodId).session(session);
    if (!deliveryMethod) {
      await session.abortTransaction();
      return res.status(400).json({ msg: 'Invalid delivery method' });
    }

    const totalAmount = subTotal + deliveryMethod.price;

    // Validate required fields before creating order
    if (!deliveryMethodId) {
      await session.abortTransaction();
      return res.status(400).json({ msg: 'Delivery method is required' });
    }

    if (!req.user || !req.user.id) {
      await session.abortTransaction();
      return res.status(401).json({ msg: 'User authentication required' });
    }

    // Validate delivery method exists
    if (!deliveryMethod) {
      await session.abortTransaction();
      return res.status(400).json({ msg: 'Invalid delivery method' });
    }

    // Validate shipping address exists if provided
    if (shippingAddressId) {
      const shippingAddress = await require('../models/DeliveryAddress').findById(shippingAddressId).session(session);
      if (!shippingAddress) {
        await session.abortTransaction();
        return res.status(400).json({ msg: 'Invalid shipping address' });
      }
    }

    // Create main order first
    const order = new Order({
      buyer: req.user.id,
      shippingAddress: shippingAddressId || null,
      deliveryMethod: deliveryMethodId,
      subTotal,
      deliveryFee: deliveryMethod.price,
      totalAmount,
      currency,
      status: 'confirmed',
      paymentStatus: 'paid',
      notes
    });

    await order.save({ session });

    // Create order items with order reference
    const orderItems = [];
    for (const cartItem of activeItems) {
      // Build variant object only if variant exists
      let variantData = undefined;
      if (cartItem.variant && typeof cartItem.variant === 'object') {
        variantData = {
          variantId: cartItem.variant._id || cartItem.variant.variantId || null,
          name: cartItem.variant.name || null,
          attributes: cartItem.variant.attributes || [],
          additionalPrice: cartItem.variant.additionalPrice || cartItem.variant.price || 0
        };
      }

      const orderItemData = {
        order: order._id,
        product: cartItem.product._id,
        specs: cartItem.specs && Array.isArray(cartItem.specs) ? cartItem.specs : [],
        quantity: cartItem.quantity,
        unitPrice: cartItem.unitPrice || cartItem.product.price,
        totalPrice: (cartItem.unitPrice || cartItem.product.price) * cartItem.quantity,
        currency: (cartItem.currency || cartItem.product?.currency || currency) === 'USDT' ? 'USDC' : (cartItem.currency || cartItem.product?.currency || currency),
        status: 'ordered',
        // Include product image data directly
        productImage: cartItem.product.images && cartItem.product.images.length > 0 ? cartItem.product.images[0] : '/images/desktop-1.png',
        productName: cartItem.product.name
      };

      // Only include variant if it exists
      if (variantData) {
        orderItemData.variant = variantData;
      }

      const orderItem = new OrderItem(orderItemData);
      await orderItem.save({ session });
      orderItems.push(orderItem._id);
    }

    // Update order with items reference
    order.items = orderItems;
    await order.save({ session });

    // Create payment record
    let paymentData = {
      order: order._id,
      user: req.user.id,
      amount: totalAmount,
      currency,
      method: paymentMethod,
      status: 'completed',
      paymentDate: new Date(),
      type: 'refund',
      refundReason: 'Order cancelled by customer'
    };

    if (paymentMethod === 'paystack') {
      // Verify Paystack payment
      const referenceString = typeof paystackReference === 'string'
        ? paystackReference
        : paystackReference?.reference;

      if (!referenceString) {
        await session.abortTransaction();
        return res.status(400).json({ msg: 'Paystack reference is required' });
      }

      const verification = await Paystack.transaction.verify({ reference: referenceString });

      if (!verification.status || verification.data.status !== 'success') {
        await session.abortTransaction();
        return res.status(400).json({ msg: 'Payment verification failed' });
      }

      paymentData.reference = referenceString;
      paymentData.paystackReference = referenceString;
    } else if (paymentMethod === 'seerbit') {
      const refStr = typeof seerbitReference === 'string' ? seerbitReference : seerbitReference?.reference;
      if (!refStr) {
        await session.abortTransaction();
        return res.status(400).json({ msg: 'SeerBit reference is required' });
      }
      paymentData.reference = refStr;
      paymentData.seerbitReference = refStr;
    } else if (paymentMethod === 'wallet') {
      paymentData.walletAddress = req.user.walletAddress;
    }

    const payment = new Payment(paymentData);
    await payment.save({ session });

    // Update order with payment reference
    order.payments = [payment._id];
    await order.save({ session });

    // Mark only the active cart items as ordered (preserve already ordered items)
    cart.items = cart.items.map(item => {
      const itemObj = item.toObject();
      // Only mark as ordered if it was in the activeItems (i.e., it was processed in this order)
      if (activeItems.some(activeItem => activeItem.productId.toString() === item.productId.toString())) {
        itemObj.status = 'ordered';
      }
      return itemObj;
    });
    await cart.save({ session });

    // Award referral bonus
    if (req.user.referredBy) {
      await awardReferralBonus(req.user.id, totalAmount);
    }

    await session.commitTransaction();
    transactionCommitted = true;

    // Return minimal order object for faster response
    const orderObj = order.toObject();
    orderObj._id = orderObj._id.toString();

    return res.json({
      _id: orderObj._id,
      orderNumber: orderObj.orderNumber,
      status: orderObj.status,
      paymentStatus: orderObj.paymentStatus,
      totalAmount: orderObj.totalAmount,
      currency: orderObj.currency,
      paymentMethod: orderObj.paymentMethod,
      createdAt: orderObj.createdAt,
      orderId: orderObj._id,
      message: 'Order created and payment confirmed successfully'
    });

  } catch (error) {
    if (!transactionCommitted) {
      try { await session.abortTransaction(); } catch (abortErr) { /* ignore */ }
    }
    console.error('Payment verification error:', error?.message || error);
    if (error?.stack) console.error(error.stack);
    res.status(500).json({ msg: 'Payment verification failed', error: error?.message || 'Unknown error' });
  } finally {
    try { session.endSession(); } catch (e) { /* ignore */ }
  }
};

// @desc    Get orders with pagination and filtering
// @route   GET /api/orders/paginated
// @access  Private
const getOrdersPaginated = async (req, res) => {
  try {
    const { page = 1, limit = 10, status = 'all' } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build filter query
    let statusFilter = {};
    if (status && status !== 'all') {
      switch (status) {
        case 'to-be-received':
          statusFilter = { status: { $in: ['pending', 'confirmed', 'processing', 'shipped'] } };
          break;
        case 'completed':
          statusFilter = { status: 'delivered' };
          break;
        case 'cancelled':
          statusFilter = { status: { $in: ['cancelled', 'refunded'] } };
          break;
        default:
          // For specific status values, filter by exact match
          statusFilter = { status };
      }
    }

    const filter = {
      buyer: req.user.id,
      ...statusFilter
    };

    // Get total count for pagination
    const totalOrders = await Order.countDocuments(filter);

    // Get paginated orders
    const orders = await Order.find(filter)
      .populate({
        path: 'items',
        populate: {
          path: 'product',
          select: 'name price images currency'
        }
      })
      .populate('buyer', ['name', 'email', 'walletAddress'])
      .populate('shippingAddress')
      .populate('deliveryMethod')
      .populate('payments')
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(limitNum);

    // Debug logging to see the actual data structure
    if (orders.length > 0) {
      console.log('Orders data structure:', JSON.stringify(orders[0], null, 2));
      console.log('First order item product:', orders[0].items?.[0]?.product);
      
      // Check if product is populated correctly
      const firstItem = orders[0].items?.[0];
      if (firstItem && firstItem.product) {
        console.log('Product population check:', {
          productId: firstItem.product._id,
          hasImages: !!firstItem.product.images,
          imagesLength: firstItem.product.images?.length || 0,
          hasVariants: !!firstItem.product.variants,
          variantsLength: firstItem.product.variants?.length || 0,
          hasFirstImage: !!firstItem.product.firstImage,
          firstImage: firstItem.product.firstImage,
          productKeys: Object.keys(firstItem.product)
        });
      }
    }

    // Ensure all order IDs are strings and manually populate product data if needed
    const ordersWithStringIds = await Promise.all(orders.map(async (order) => {
      const orderObj = order.toObject();
      orderObj._id = orderObj._id.toString();

      // Flatten shipping address data for frontend compatibility
      if (orderObj.shippingAddress) {
        orderObj.shipping = {
          name: `${orderObj.shippingAddress.firstName} ${orderObj.shippingAddress.lastName}`,
          email: orderObj.shippingAddress.email,
          phone: `${orderObj.shippingAddress.areaNumber}${orderObj.shippingAddress.phoneNumber}`,
          address: orderObj.shippingAddress.streetAddress
        };
      }

      // Flatten delivery method data for frontend compatibility
      if (orderObj.deliveryMethod) {
        orderObj.delivery = {
          method: orderObj.deliveryMethod.name,
          timeframe: orderObj.deliveryMethod.estimatedDeliveryTime
        };
      }

      // Flatten pricing data for frontend compatibility
      orderObj.pricing = {
        subtotal: orderObj.subTotal,
        delivery: orderObj.deliveryFee,
        total: orderObj.totalAmount
      };

      // Flatten product data for frontend compatibility
      if (orderObj.items && orderObj.items.length > 0) {
        const firstItem = orderObj.items[0];
        orderObj.product = {
          name: firstItem.productName || firstItem.product?.name || 'Product',
          variant: firstItem.variant?.name || '',
          quantity: firstItem.quantity,
          price: firstItem.unitPrice,
          images: firstItem.product?.images || []
        };
      }

      // Check if product data is incomplete and manually populate if needed
      if (orderObj.items && orderObj.items.length > 0) {
        for (let item of orderObj.items) {
          if (item.product && (!item.product.images || item.product.images.length === 0 || !item.product.hasOwnProperty('images'))) {
            try {
              // Manually fetch the product with full data
              const Product = require('../models/Product');
              const fullProduct = await Product.findById(item.product._id).lean();
              console.log('Manual population - fetched product:', {
                id: fullProduct?._id,
                name: fullProduct?.name,
                hasImages: !!fullProduct?.images,
                imagesLength: fullProduct?.images?.length || 0,
                images: fullProduct?.images
              });
              if (fullProduct) {
                item.product = {
                  ...item.product,
                  images: fullProduct.images && fullProduct.images.length > 0 ? fullProduct.images : ['/images/desktop-1.png'],
                  variants: fullProduct.variants || [],
                  firstImage: fullProduct.images && fullProduct.images.length > 0 ? fullProduct.images[0] : '/images/desktop-1.png'
                };
                console.log('Manually populated product:', item.product._id, 'with images:', item.product.images?.length || 0);
              }
            } catch (error) {
              console.error('Error manually populating product:', error);
            }
          }
        }
      }

      return orderObj;
    }));

    // Final fallback - ensure all products have images
    ordersWithStringIds.forEach(order => {
      if (order.items && order.items.length > 0) {
        order.items.forEach(item => {
          if (item.product && (!item.product.images || item.product.images.length === 0)) {
            item.product.images = ['/images/desktop-1.png'];
            item.product.firstImage = '/images/desktop-1.png';
            console.log('Final fallback - added placeholder image for product:', item.product._id);
          }
        });
      }
    });

    const totalPages = Math.ceil(totalOrders / limitNum);

    res.json({
      orders: ordersWithStringIds,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalOrders,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
        limit: limitNum
      }
    });
  } catch (err) {
    console.error('Error fetching paginated orders:', err.message);
    res.status(500).json({ msg: 'Server Error', error: err.message });
  }
};

// @desc    Cancel order and process refund
// @route   POST /api/orders/:id/cancel
// @access  Private
const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ msg: 'Order not found' });
    }

    // Check if user owns this order
    if (order.buyer.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Access denied' });
    }

    // Check if order can be cancelled (only before shipping)
    const cancellableStatuses = ['pending', 'confirmed', 'processing'];
    if (!cancellableStatuses.includes(order.status)) {
      return res.status(400).json({
        msg: 'Order cannot be cancelled at this stage. Please contact support if you need assistance.'
      });
    }

    // Update order status to cancelled
    order.status = 'cancelled';
    order.cancelledAt = new Date();
    order.cancelledBy = req.user.id;

    // Create refund record
    const Payment = require('../models/Payment');
    const refundPayment = new Payment({
      order: order._id,
      user: req.user.id,
      amount: order.totalAmount,
      currency: order.currency,
      method: order.paymentMethod || 'wallet',
      status: 'pending',
      paymentDate: new Date(),
      notes: 'Refund initiated due to order cancellation'
    });

    await refundPayment.save();

    // Update order with refund reference
    order.payments = order.payments || [];
    order.payments.push(refundPayment._id);

    await order.save();

    // Populate order details for response
    const populatedOrder = await Order.findById(order._id)
      .populate({
        path: 'items',
        populate: {
          path: 'product',
          select: 'name price images currency'
        }
      })
      .populate('buyer', ['name', 'email', 'walletAddress'])
      .populate('shippingAddress')
      .populate('deliveryMethod')
      .populate('payments');

    // Flatten data for frontend compatibility
    const orderObj = populatedOrder.toObject();
    orderObj._id = orderObj._id.toString();

    if (orderObj.shippingAddress) {
      orderObj.shipping = {
        name: `${orderObj.shippingAddress.firstName} ${orderObj.shippingAddress.lastName}`,
        email: orderObj.shippingAddress.email,
        phone: `${orderObj.shippingAddress.areaNumber}${orderObj.shippingAddress.phoneNumber}`,
        address: orderObj.shippingAddress.streetAddress
      };
    }

    if (orderObj.deliveryMethod) {
      orderObj.delivery = {
        method: orderObj.deliveryMethod.name,
        timeframe: orderObj.deliveryMethod.estimatedDeliveryTime
      };
    }

    orderObj.pricing = {
      subtotal: orderObj.subTotal,
      delivery: orderObj.deliveryFee,
      total: orderObj.totalAmount
    };

    if (orderObj.items && orderObj.items.length > 0) {
      const firstItem = orderObj.items[0];
      orderObj.product = {
        name: firstItem.productName || firstItem.product?.name || 'Product',
        variant: firstItem.variant?.name || '',
        quantity: firstItem.quantity,
        price: firstItem.unitPrice,
        images: firstItem.product?.images || []
      };
    }

    // Add order stages mapping
    const orderStages = [
      { id: 1, name: "Submit Order", rank: 1 },
      { id: 2, name: "Waiting for Delivery", rank: 2 },
      { id: 3, name: "Out for delivery", rank: 3 },
      { id: 4, name: "Transaction Complete", rank: 4 }
    ];

    let currentStage = 1;
    switch (orderObj.status) {
      case 'confirmed':
      case 'processing':
        currentStage = 2;
        break;
      case 'shipped':
        currentStage = 3;
        break;
      case 'delivered':
        currentStage = 4;
        break;
      default:
        currentStage = 1;
    }

    orderObj.currentStage = currentStage;
    orderObj.stages = orderStages.map(stage => ({
      ...stage,
      completed: stage.rank <= currentStage,
      active: stage.rank === currentStage
    }));

    res.json({
      ...orderObj,
      message: 'Order cancelled successfully. Refund will be processed within 3-5 business days.',
      refundId: refundPayment._id
    });
  } catch (err) {
    console.error('Error cancelling order:', err);
    res.status(500).json({ msg: 'Server Error', error: err.message });
  }
};

// @desc    Process USDC wallet payment
// @route   POST /api/orders/usdc-payment
// @access  Private
const processUSDCWalletPayment = async (req, res) => {
  try {
    const {
      deliveryMethodId,
      shippingAddressId,
      currency = 'USDC',
      notes = ''
    } = req.body;

    // Check if user has Privy wallet
    if (!req.user.walletAddress) {
      return res.status(400).json({
        msg: 'Wallet address not found. Please connect your wallet first.',
        fallback: 'wallet_debit'
      });
    }

    // Get user's cart
    let cart = await Cart.findOne({ user: req.user.id }).populate('items.product', ['price', 'images', 'currency', 'name']);
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ msg: 'Cart is empty' });
    }

    // Filter out ordered items - only process active items
    const activeItems = cart.items.filter(item => item.status !== 'ordered');
    if (activeItems.length === 0) {
      return res.status(400).json({ msg: 'No active items in cart' });
    }

    // Calculate totals
    let subTotal = 0;
    for (const item of activeItems) {
      let itemPrice = item.product.price;
      if (item.product.currency && item.product.currency !== currency) {
        if (item.product.currency === 'NGN' && currency === 'USDC') {
          itemPrice = item.product.price / 1500;
        } else if (item.product.currency === 'USDC' && currency === 'NGN') {
          itemPrice = item.product.price * 1500;
        }
      }
      subTotal += itemPrice * item.quantity;
    }

    // Get delivery method
    const deliveryMethod = await DeliveryMethod.findById(deliveryMethodId);
    if (!deliveryMethod) {
      return res.status(400).json({ msg: 'Invalid delivery method' });
    }

    const totalAmount = subTotal + deliveryMethod.price;

    // Check if user has sufficient balance
    if (req.user.platformBalance < totalAmount) {
      return res.status(400).json({
        msg: 'Insufficient USDC balance. Please top up your account or use a different payment method.',
        required: totalAmount,
        available: req.user.platformBalance,
        shortfall: totalAmount - req.user.platformBalance
      });
    }

    // Deduct from user's platform balance
    req.user.platformBalance -= totalAmount;
    await req.user.save();

    // Create order
    const order = new Order({
      buyer: req.user.id,
      shippingAddress: shippingAddressId || null,
      deliveryMethod: deliveryMethodId,
      subTotal,
      deliveryFee: deliveryMethod.price,
      totalAmount,
      currency,
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentMethod: 'usdc_wallet',
      notes
    });

    await order.save();

    // Create order items
    const orderItems = [];
    for (const cartItem of activeItems) {
      const orderItem = new OrderItem({
        order: order._id,
        product: cartItem.product._id,
        variant: cartItem.variant || null, // Include variant data from cart
        specs: cartItem.specs || null, // Include specs from cart
        quantity: cartItem.quantity,
        unitPrice: cartItem.unitPrice || cartItem.product.price,
        totalPrice: (cartItem.unitPrice || cartItem.product.price) * cartItem.quantity,
        currency: (cartItem.currency || cartItem.product?.currency || currency) === 'USDT' ? 'USDC' : (cartItem.currency || cartItem.product?.currency || currency),
        status: 'ordered',
        productImage: cartItem.product.images && cartItem.product.images.length > 0 ? cartItem.product.images[0] : '/images/desktop-1.png',
        productName: cartItem.product.name
      });
      await orderItem.save();
      orderItems.push(orderItem._id);
    }

    // Update order with items reference
    order.items = orderItems;
    await order.save();

    // Create payment record
    const payment = new Payment({
      order: order._id,
      user: req.user.id,
      amount: totalAmount,
      currency,
      method: 'usdc_wallet',
      status: 'completed',
      paymentDate: new Date(),
      walletAddress: req.user.walletAddress
    });

    await payment.save();

    // Update order with payment reference
    order.payments = [payment._id];
    await order.save();

    // Reduce stock when order is created with completed payment
    // Stock is reduced immediately when payment is completed
    try {
      for (const cartItem of activeItems) {
        const variantId = cartItem.variantName || cartItem.variant?.name || null;
        await reduceStockOnOrder(cartItem.product._id, variantId, cartItem.quantity);
      }
    } catch (stockError) {
      console.error('Error reducing stock on order creation:', stockError);
      // Don't fail the order if stock reduction fails, just log it
    }

    // Mark cart items as ordered
    cart.items = cart.items.map(item => {
      const itemObj = item.toObject();
      if (activeItems.some(activeItem => activeItem.productId.toString() === item.productId.toString())) {
        itemObj.status = 'ordered';
      }
      return itemObj;
    });
    await cart.save();

    // Award referral bonus
    if (req.user.referredBy) {
      await awardReferralBonus(req.user.id, totalAmount);
    }

    const orderObj = order.toObject();
    orderObj._id = orderObj._id.toString();

    return res.json({
      _id: orderObj._id,
      orderNumber: orderObj.orderNumber,
      status: orderObj.status,
      paymentStatus: orderObj.paymentStatus,
      totalAmount: orderObj.totalAmount,
      currency: orderObj.currency,
      paymentMethod: orderObj.paymentMethod,
      createdAt: orderObj.createdAt,
      orderId: orderObj._id,
      message: 'USDC payment processed successfully'
    });

  } catch (error) {
    console.error('USDC wallet payment error:', error);

    // If USDC wallet payment fails, suggest fallback to wallet debit
    if (error.message.includes('wallet') || error.message.includes('balance') || error.message.includes('Insufficient')) {
      return res.status(400).json({
        msg: 'USDC wallet payment failed. Please try wallet debit method.',
        fallback: 'wallet_debit',
        error: error.message
      });
    }

    res.status(500).json({ msg: 'Payment processing failed', error: error.message });
  }
};

// @desc    Create order with crypto payment (blockchain)
// @route   POST /api/orders/create-crypto-payment
// @access  Private
const createCryptoPaymentOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  let transactionCommitted = false;

  try {
    const {
      deliveryMethodId,
      shippingAddressId,
      currency = 'USDC',
      orderCurrency, // Native currency for order calculations (USD for non-NGN, NGN for NGN)
      notes = '',
      network = 'base', // base, ethereum, polygon, bsc
      walletAddress: requestWalletAddress // User's connected wallet - attach to user if not already set
    } = req.body;

    // Attach user's wallet to their profile if provided and they don't have one (never overwrite existing)
    if (requestWalletAddress && /^0x[0-9a-fA-F]{40}$/.test(requestWalletAddress)) {
      const user = await User.findById(req.user.id).session(session);
      if (user && !user.walletAddress) {
        user.walletAddress = requestWalletAddress;
        await user.save({ session });
      }
    }

    // Get user's cart
    let cart = await Cart.findOne({ user: req.user.id })
      .populate('items.product', ['price', 'images', 'currency', 'name', 'stock'])
      .session(session);
    
    if (!cart || cart.items.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ msg: 'Cart is empty' });
    }

    // Filter out ordered items - only process active items
    const activeItems = cart.items.filter(item => item.status !== 'ordered');
    if (activeItems.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ msg: 'No active items in cart' });
    }

    // Determine order currency: use native currency (USD) for non-NGN payments
    // For NGN payments, use NGN (which may be converted by currency provider)
    const orderCalcCurrency = orderCurrency || (currency !== 'NGN' ? 'USD' : 'NGN');
    
    // Calculate totals in order currency (USD for non-NGN, NGN for NGN)
    let subTotal = 0;
    for (const item of activeItems) {
      let itemPrice = item.product.price;
      const productCurrency = item.product.currency || 'USD';
      
      // Convert product price to order currency if needed
      if (productCurrency !== orderCalcCurrency) {
        // Convert from product currency to order currency
        if (productCurrency === 'NGN' && orderCalcCurrency === 'USD') {
          itemPrice = item.product.price / 1500; // NGN to USD
        } else if (productCurrency === 'USD' && orderCalcCurrency === 'NGN') {
          itemPrice = item.product.price * 1500; // USD to NGN
        } else if (productCurrency === 'USDC' && orderCalcCurrency === 'USD') {
          itemPrice = item.product.price; // USDC = USD (1:1)
        } else if (productCurrency === 'USD' && orderCalcCurrency === 'USDC') {
          itemPrice = item.product.price; // USD = USDC (1:1)
        }
        // Add more conversions as needed
      }
      subTotal += itemPrice * item.quantity;
    }

    // Get delivery method
    const deliveryMethod = await DeliveryMethod.findById(deliveryMethodId).session(session);
    if (!deliveryMethod) {
      await session.abortTransaction();
      return res.status(400).json({ msg: 'Invalid delivery method' });
    }

    // Convert delivery cost to order currency if needed
    let deliveryCost = deliveryMethod.price;
    const deliveryCurrency = deliveryMethod.currency || 'NGN';
    if (deliveryCurrency !== orderCalcCurrency) {
      if (deliveryCurrency === 'NGN' && orderCalcCurrency === 'USD') {
        deliveryCost = deliveryMethod.price / 1500; // NGN to USD
      } else if (deliveryCurrency === 'USD' && orderCalcCurrency === 'NGN') {
        deliveryCost = deliveryMethod.price * 1500; // USD to NGN
      }
    }

    // Total in order currency (USD for non-NGN, NGN for NGN)
    const totalAmountInOrderCurrency = subTotal + deliveryCost;
    
    // Convert total from order currency to payment currency if different
    let totalAmount = totalAmountInOrderCurrency;
    if (orderCalcCurrency !== currency) {
      if (orderCalcCurrency === 'USD' && currency === 'USDC') {
        totalAmount = totalAmountInOrderCurrency; // USD = USDC (1:1)
      } else if (orderCalcCurrency === 'USD' && currency === 'NGN') {
        totalAmount = totalAmountInOrderCurrency * 1500; // USD to NGN
      } else if (orderCalcCurrency === 'NGN' && currency === 'USD') {
        totalAmount = totalAmountInOrderCurrency / 1500; // NGN to USD
      } else if (orderCalcCurrency === 'NGN' && currency === 'USDC') {
        totalAmount = totalAmountInOrderCurrency / 1500; // NGN to USDC
      }
      // Add more conversions as needed
    }

    // Validate shipping address if provided
    if (shippingAddressId) {
      const DeliveryAddress = require('../models/DeliveryAddress');
      const shippingAddress = await DeliveryAddress.findById(shippingAddressId).session(session);
      if (!shippingAddress) {
        await session.abortTransaction();
        return res.status(400).json({ msg: 'Invalid shipping address' });
      }
    }

    // Check for existing uncompleted order with exact same items (prevent duplicates)
    const cartSignature = activeItems
      .map((i) => `${i.product._id.toString()}:${i.quantity}`)
      .sort()
      .join('|');
    const existingUncompleted = await Order.find({
      buyer: req.user.id,
      status: 'pending',
      paymentStatus: 'unpaid',
      paymentMethod: 'crypto',
      deliveryMethod: deliveryMethodId,
      shippingAddress: shippingAddressId || null,
      paymentExpiry: { $gt: new Date() } // Only reuse if not expired
    })
      .populate('items')
      .session(session)
      .lean();

    for (const ex of existingUncompleted) {
      if (!ex.items || ex.items.length !== activeItems.length) continue;
      const exSignature = ex.items
        .map((i) => {
          const pid = i.product && (i.product._id || i.product);
          return `${pid ? pid.toString() : ''}:${i.quantity || 0}`;
        })
        .sort()
        .join('|');
      if (exSignature === cartSignature && ex.paymentAddress) {
        await session.commitTransaction();
        transactionCommitted = true;
        const QRCode = require('qrcode');
        let qrCodeDataUrl = null;
        try {
          const paymentURI = `${(ex.paymentNetwork || network) === 'ethereum' ? 'ethereum' : (ex.paymentNetwork || network)}:${ex.paymentAddress}?value=${totalAmount}`;
          qrCodeDataUrl = await QRCode.toDataURL(paymentURI);
        } catch (qrErr) {
          console.error('Error generating QR for reused order:', qrErr);
        }
        return res.status(200).json({
          orderId: ex._id.toString(),
          paymentAddress: ex.paymentAddress,
          amount: totalAmount,
          currency,
          network: ex.paymentNetwork || network,
          qrCode: qrCodeDataUrl,
          expiry: ex.paymentExpiry,
          reused: true
        });
      }
    }

    // Create order with pending payment status
    // Store order values in order currency (USD for non-NGN, NGN for NGN)
    // But totalAmount should be in payment currency
    const order = new Order({
      buyer: req.user.id,
      shippingAddress: shippingAddressId || null,
      deliveryMethod: deliveryMethodId,
      subTotal: subTotal, // In order currency (USD for non-NGN)
      deliveryFee: deliveryCost, // In order currency (USD for non-NGN)
      totalAmount: totalAmount, // In payment currency (what user pays)
      currency: currency, // Payment currency
      status: 'pending',
      paymentStatus: 'unpaid',
      paymentMethod: 'crypto',
      paymentNetwork: network,
      notes,
      requiredConfirmations: 3
    });

    await order.save({ session });

    // Use user-tied payment address: one per user, never regenerate if user has one
    const blockchainPaymentService = require('../services/blockchainPaymentService');
    const userId = String(req.user.id || req.user._id);
    let userDoc = await User.findById(userId).session(session);
    let paymentAddress;
    if (userDoc && userDoc.cryptoPaymentAddress) {
      paymentAddress = userDoc.cryptoPaymentAddress;
    } else {
      paymentAddress = blockchainPaymentService.generatePaymentAddressForUser(userId);
      if (!userDoc) userDoc = await User.findById(userId).session(session);
      if (userDoc) {
        userDoc.cryptoPaymentAddress = paymentAddress;
        await userDoc.save({ session });
      }
    }

    // Set payment address and expiry (30 minutes)
    order.paymentAddress = paymentAddress;
    order.paymentExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    await order.save({ session });

    // Create order items (map USDT to USDC - enum only allows USDC)
    const orderItems = [];
    for (const cartItem of activeItems) {
      let variantData = undefined;
      if (cartItem.variant && typeof cartItem.variant === 'object') {
        variantData = {
          variantId: cartItem.variant._id || cartItem.variant.variantId || null,
          name: cartItem.variant.name || null,
          attributes: cartItem.variant.attributes || [],
          additionalPrice: cartItem.variant.additionalPrice || cartItem.variant.price || 0
        };
      }

      const rawCurrency = cartItem.currency || cartItem.product?.currency || currency;
      const itemCurrency = rawCurrency === 'USDT' ? 'USDC' : rawCurrency;
      const orderItemData = {
        order: order._id,
        product: cartItem.product._id,
        specs: cartItem.specs && Array.isArray(cartItem.specs) ? cartItem.specs : [],
        quantity: cartItem.quantity,
        unitPrice: cartItem.unitPrice || cartItem.product.price,
        totalPrice: (cartItem.unitPrice || cartItem.product.price) * cartItem.quantity,
        currency: itemCurrency,
        status: 'ordered',
        productImage: cartItem.product.images && cartItem.product.images.length > 0 ? cartItem.product.images[0] : '/images/desktop-1.png',
        productName: cartItem.product.name
      };

      if (variantData) {
        orderItemData.variant = variantData;
      }

      const orderItem = new OrderItem(orderItemData);
      await orderItem.save({ session });
      orderItems.push(orderItem._id);
    }

    // Update order with items
    order.items = orderItems;
    await order.save({ session });

    // Start monitoring for payment
    const transactionMonitor = require('../services/transactionMonitor');
    transactionMonitor.startMonitoring(
      order._id.toString(),
      paymentAddress,
      totalAmount,
      async (orderId, address, amount, txHash) => {
        // Payment received callback
        try {
          const confirmedOrder = await Order.findById(orderId);
          if (confirmedOrder && confirmedOrder.paymentStatus === 'unpaid') {
            confirmedOrder.paymentStatus = 'paid';
            confirmedOrder.status = 'confirmed';
            confirmedOrder.paymentTransactionHash = txHash || null;
            confirmedOrder.paymentConfirmations = 3;
            await confirmedOrder.save();

            // Create payment record
            const payment = new Payment({
              order: confirmedOrder._id,
              user: confirmedOrder.buyer,
              amount: confirmedOrder.totalAmount,
              currency: confirmedOrder.currency,
              method: 'crypto',
              status: 'completed',
              paymentDate: new Date(),
              transactionHash: txHash
            });
            await payment.save();

            // Mark cart items as ordered
            const userCart = await Cart.findOne({ user: confirmedOrder.buyer });
            if (userCart) {
              userCart.items = userCart.items.map(item => {
                const itemObj = item.toObject();
                if (activeItems.some(activeItem => activeItem.productId.toString() === item.productId.toString())) {
                  itemObj.status = 'ordered';
                }
                return itemObj;
              });
              await userCart.save();
            }

            // Award referral bonus
            const buyer = await User.findById(confirmedOrder.buyer);
            if (buyer && buyer.referredBy) {
              await awardReferralBonus(buyer._id, confirmedOrder.totalAmount);
            }

            // Pay from wallet: transfer to platform wallet (user-tied address uses buyerId for sweep)
            try {
              const payResult = await blockchainPaymentService.payFromWallet(
                confirmedOrder._id.toString(),
                confirmedOrder.currency,
                { buyerId: confirmedOrder.buyer.toString() }
              );
              if (payResult.success) {
                confirmedOrder.fundsSwept = true;
                confirmedOrder.fundsSweptAt = new Date();
                confirmedOrder.fundsSweptTxHash = payResult.transactionHash;
                await confirmedOrder.save();
                console.log(`Order ${confirmedOrder._id} funds swept to platform wallet`);
              }
            } catch (sweepErr) {
              console.error(`Order ${confirmedOrder._id} payFromWallet error (sweeper will retry):`, sweepErr.message);
            }

            // Reduce stock
            await reduceStockOnOrder(confirmedOrder);
          }
        } catch (error) {
          console.error('Error processing payment callback:', error);
        }
      },
      currency
    );

    await session.commitTransaction();
    transactionCommitted = true;

    // Generate QR code data
    const QRCode = require('qrcode');
    let qrCodeDataUrl = null;
    try {
      // Create payment URI (ethereum:address?value=amount)
      const paymentURI = `${network === 'ethereum' ? 'ethereum' : network}:${paymentAddress}?value=${totalAmount}`;
      qrCodeDataUrl = await QRCode.toDataURL(paymentURI);
    } catch (error) {
      console.error('Error generating QR code:', error);
    }

    return res.json({
      orderId: order._id,
      orderNumber: order.orderNumber,
      paymentAddress,
      amount: totalAmount,
      currency,
      network,
      qrCode: qrCodeDataUrl,
      expiry: order.paymentExpiry,
      message: 'Order created. Please send payment to the provided address.'
    });

  } catch (error) {
    if (!transactionCommitted) {
      await session.abortTransaction();
    }
    console.error('Error creating crypto payment order:', error);
    res.status(500).json({ msg: 'Error creating payment order', error: error.message });
  } finally {
    session.endSession();
  }
};

// @desc    Check crypto payment status
// @route   GET /api/orders/:orderId/crypto-payment-status
// @access  Private
const checkCryptoPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ msg: 'Order not found' });
    }

    // Verify user owns this order
    if (order.buyer.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Unauthorized' });
    }

    // Check if payment address exists
    if (!order.paymentAddress) {
      return res.status(400).json({ msg: 'No payment address for this order' });
    }

    // Check payment status
    if (order.paymentStatus === 'paid') {
      return res.json({
        status: 'paid',
        paymentStatus: order.paymentStatus,
        orderStatus: order.status,
        transactionHash: order.paymentTransactionHash,
        confirmations: order.paymentConfirmations
      });
    }

    // Check if payment received
    const blockchainPaymentService = require('../services/blockchainPaymentService');
    const paymentReceived = await blockchainPaymentService.checkPaymentReceived(
      order.paymentAddress,
      order.totalAmount,
      order.currency || 'USDC'
    );

    if (paymentReceived) {
      // Get transaction hash if available
      const transactionMonitor = require('../services/transactionMonitor');
      const confirmations = await blockchainPaymentService.getConfirmations(
        order.paymentTransactionHash || ''
      );

      return res.json({
        status: 'pending_confirmation',
        paymentReceived: true,
        confirmations,
        requiredConfirmations: order.requiredConfirmations || 3,
        paymentAddress: order.paymentAddress,
        expectedAmount: order.totalAmount,
        currency: order.currency
      });
    }

    // Check if expired
    if (order.paymentExpiry && new Date() > order.paymentExpiry) {
      return res.json({
        status: 'expired',
        paymentReceived: false,
        paymentAddress: order.paymentAddress,
        expectedAmount: order.totalAmount,
        currency: order.currency
      });
    }

    return res.json({
      status: 'waiting',
      paymentReceived: false,
      paymentAddress: order.paymentAddress,
      expectedAmount: order.totalAmount,
      currency: order.currency,
      expiry: order.paymentExpiry
    });

  } catch (error) {
    console.error('Error checking payment status:', error);
    res.status(500).json({ msg: 'Error checking payment status', error: error.message });
  }
};

// @desc    Confirm crypto payment (check + sweep + confirm order) - called when user clicks "I have made payment"
// @route   POST /api/orders/:orderId/confirm-crypto-payment
// @access  Private
const confirmCryptoPayment = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId).populate('buyer');
    if (!order) {
      return res.status(404).json({ msg: 'Order not found' });
    }

    const buyerId = (order.buyer._id || order.buyer).toString();
    if (buyerId !== req.user.id) {
      return res.status(403).json({ msg: 'Unauthorized' });
    }

    if (order.paymentStatus === 'paid') {
      return res.json({
        success: true,
        status: 'paid',
        message: 'Order already confirmed',
        orderStatus: order.status
      });
    }

    if (order.paymentMethod !== 'crypto' || !order.paymentAddress) {
      return res.status(400).json({ msg: 'Not a crypto order or no payment address' });
    }

    const blockchainPaymentService = require('../services/blockchainPaymentService');
    const paymentReceived = await blockchainPaymentService.checkPaymentReceived(
      order.paymentAddress,
      order.totalAmount,
      order.currency || 'USDC'
    );

    if (!paymentReceived) {
      return res.status(400).json({
        success: false,
        msg: 'Payment not detected',
        paymentReceived: false
      });
    }

    // Payment detected: sweep, confirm, process
    const buyer = await User.findById(order.buyer._id || order.buyer).select('cryptoPaymentAddress');
    const isUserTied = buyer?.cryptoPaymentAddress && buyer.cryptoPaymentAddress === order.paymentAddress;
    const sweepOptions = isUserTied ? { buyerId: (order.buyer._id || order.buyer).toString() } : {};

    const payResult = await blockchainPaymentService.payFromWallet(order._id.toString(), order.currency || 'USDC', sweepOptions);

    if (!payResult.success) {
      return res.status(500).json({
        success: false,
        msg: payResult.message || 'Failed to sweep funds'
      });
    }

    order.paymentStatus = 'paid';
    order.status = 'confirmed';
    order.paymentTransactionHash = payResult.transactionHash;
    order.paymentConfirmations = 3;
    order.fundsSwept = true;
    order.fundsSweptAt = new Date();
    order.fundsSweptTxHash = payResult.transactionHash;
    await order.save();

    const existingPayment = await Payment.findOne({ order: order._id });
    if (!existingPayment) {
      const payment = new Payment({
        order: order._id,
        user: order.buyer._id || order.buyer,
        amount: order.totalAmount,
        currency: order.currency,
        method: 'crypto',
        status: 'completed',
        paymentDate: new Date(),
        transactionHash: payResult.transactionHash
      });
      await payment.save();
    }

    const userCart = await Cart.findOne({ user: order.buyer._id || order.buyer });
    if (userCart) {
      userCart.items = userCart.items.map(item => {
        const itemObj = item.toObject ? item.toObject() : item;
        itemObj.status = 'ordered';
        return itemObj;
      });
      await userCart.save();
    }

    const buyerUser = await User.findById(order.buyer._id || order.buyer);
    if (buyerUser && buyerUser.referredBy) {
      await awardReferralBonus(buyerUser._id, order.totalAmount);
    }

    await reduceStockOnOrder(order);

    const transactionMonitor = require('../services/transactionMonitor');
    transactionMonitor.stopMonitoring(order._id.toString());

    return res.json({
      success: true,
      status: 'paid',
      orderStatus: 'confirmed',
      transactionHash: payResult.transactionHash
    });
  } catch (error) {
    console.error('Error confirming crypto payment:', error);
    res.status(500).json({ msg: 'Error confirming payment', error: error.message });
  }
};

/**
 * GET /api/orders/seerbit/callback
 * SeerBit redirects here after payment (when callbackUrl is backend). No auth.
 * Redirects user to frontend success page with ?reference= so frontend can call verify-payment.
 */
const handleSeerbitCallback = (req, res) => {
  const raw = req.query.reference;
  const reference = Array.isArray(raw) ? raw[0] : raw;
  if (!reference) {
    return res.status(400).send('Missing reference');
  }
  const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  if (frontendUrl) {
    const url = `${frontendUrl}/checkout/success?reference=${encodeURIComponent(reference)}`;
    return res.redirect(302, url);
  }
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(
    `<!DOCTYPE html><html><head><title>Payment successful</title></head><body><p>Payment successful. Reference: ${reference}</p><p>Set FRONTEND_URL in backend .env and use that as callback URL so you are redirected to the app.</p></body></html>`
  );
};

module.exports = {
  createOrder,
  checkoutFromCart,
  handlePaystackWebhook,
  handleSeerbitCallback,
  getOrders,
  getOrdersPaginated,
  getOrderById,
  getOrderByNumber,
  getOrderByPaystackReference,
  verifyPaymentAndCreateOrder,
  processUSDCWalletPayment,
  createCryptoPaymentOrder,
  checkCryptoPaymentStatus,
  confirmCryptoPayment,
  updateOrderStatus,
  cancelOrder,
  adminListOrders,
  adminGetOrderById,
  adminUpdateOrder,
};