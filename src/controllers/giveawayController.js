const Giveaway = require('../models/Giveaway');
const GiveawayClaim = require('../models/GiveawayClaim');
const Product = require('../models/Product');
const { Order, OrderItem } = require('../models/Order');
const DeliveryMethod = require('../models/DeliveryMethod');
const User = require('../models/User');
const DeliveryAddress = require('../models/DeliveryAddress');
const seerbitService = require('../services/seerbitService');
const currencyExchangeService = require('../services/currencyExchangeService');

const NGN_PER_USD = 1500;
const normalizeWallet = (addr) => (addr && typeof addr === 'string' ? addr.toLowerCase().trim() : '');

/** Public: list active giveaways (no coupons/addresses) */
const list = async (req, res) => {
  try {
    const now = new Date();
    const giveaways = await Giveaway.find({ expiresAt: { $gt: now } })
      .populate('items.product', 'name slug price currency images description')
      .lean();

    // Also compute claimed state from existing GiveawayClaim docs,
    // in case the item.claimed flag was not set for older records.
    const giveawayIds = giveaways.map((g) => g._id);
    const claims = await GiveawayClaim.find({ giveaway: { $in: giveawayIds } })
      .select('giveaway product')
      .lean();
    const claimedKeySet = new Set(
      claims.map((c) => `${String(c.giveaway)}:${String(c.product)}`)
    );
    const out = giveaways.map((g) => ({
      _id: g._id,
      name: g.name,
      expiresAt: g.expiresAt,
      items: (g.items || [])
        .map((it) => {
          const productRef = it.product && it.product._id ? it.product._id : it.product;
          const claimedFromMap =
            productRef && claimedKeySet.has(`${String(g._id)}:${String(productRef)}`);
          return {
            _id: it._id,
            product: it.product
              ? {
                  _id: it.product._id,
                  name: it.product.name,
                  slug: it.product.slug,
                  price: it.product.price,
                  currency: it.product.currency,
                  images: it.product.images,
                  description: it.product.description,
                }
              : null,
            name: it.name || (it.product && it.product.name) || '',
            claimed: !!it.claimed || !!claimedFromMap,
            paidDeliveryByUser: it.paidDeliveryByUser !== false,
            claimType: it.claimType || 'immediate',
            claimWindowStart: it.claimWindowStart || null,
            claimWindowEnd: it.claimWindowEnd || null,
          };
        })
        .filter((it) => it.product),
    }));
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

/** Public/auth: check if current user can claim (wallet in list or valid coupon). Does not expose coupons/addresses. */
const checkClaim = async (req, res) => {
  try {
    const { giveawayId, productId } = req.params;
    const { couponCode } = req.query;
    const giveaway = await Giveaway.findById(giveawayId);
    const now = new Date();
    if (!giveaway || giveaway.expiresAt <= now) {
      return res.json({ canClaim: false, reason: 'Giveaway not found or expired' });
    }
    const item = giveaway.items.find(
      (i) => i.product && i.product.toString() === productId
    );
    if (!item) {
      return res.json({ canClaim: false, reason: 'Product not in this giveaway' });
    }

    const walletAddresses = (item.walletAddresses || []).map(normalizeWallet).filter(Boolean);
    const couponCodes = (item.couponCodes || []).map((c) => (c || '').trim()).filter(Boolean);

    let canClaim = false;
    let reason = '';

    // Time-window logic
    const claimType = item.claimType || 'immediate';
    const hasWindow = claimType === 'time_window' && item.claimWindowStart && item.claimWindowEnd;
    if (hasWindow) {
      if (now < item.claimWindowStart) {
        return res.json({
          canClaim: false,
          reason: 'Claim window has not started yet',
          paidDeliveryByUser: item.paidDeliveryByUser !== false,
          claimed: false,
          claimType,
          claimWindowStart: item.claimWindowStart,
          claimWindowEnd: item.claimWindowEnd,
        });
      }
      if (now > item.claimWindowEnd) {
        return res.json({
          canClaim: false,
          reason: 'Claim window has ended',
          paidDeliveryByUser: item.paidDeliveryByUser !== false,
          claimed: false,
          claimType,
          claimWindowStart: item.claimWindowStart,
          claimWindowEnd: item.claimWindowEnd,
        });
      }
    }

    const anyClaim = await GiveawayClaim.findOne({ giveaway: giveawayId, product: productId });
    if (anyClaim) {
      const isOwn = req.user && anyClaim.user && anyClaim.user.toString() === req.user.id;
      return res.json({
        canClaim: false,
        reason: isOwn ? 'Already claimed by you' : 'This item has already been claimed',
        paidDeliveryByUser: item.paidDeliveryByUser !== false,
        claimed: true,
      });
    }

    // Time-window: anyone logged in can claim (one claim total, no wallet/coupon required)
    if (hasWindow && req.user) {
      return res.json({
        canClaim: true,
        reason: undefined,
        paidDeliveryByUser: item.paidDeliveryByUser !== false,
        claimed: false,
        claimType,
        claimWindowStart: item.claimWindowStart || null,
        claimWindowEnd: item.claimWindowEnd || null,
      });
    }
    if (hasWindow && !req.user) {
      return res.json({
        canClaim: false,
        reason: 'Log in to claim during the window',
        paidDeliveryByUser: item.paidDeliveryByUser !== false,
        claimed: false,
        claimType,
        claimWindowStart: item.claimWindowStart || null,
        claimWindowEnd: item.claimWindowEnd || null,
      });
    }

    if (req.user) {
      const user = await User.findById(req.user.id).select('walletAddress');
      const userWallet = normalizeWallet(user?.walletAddress);
      if (userWallet && walletAddresses.includes(userWallet)) {
        canClaim = true;
      } else if (couponCode && couponCodes.includes((couponCode || '').trim())) {
        canClaim = true;
      } else if (userWallet && couponCodes.length === 0 && walletAddresses.length === 0) {
        canClaim = true;
        reason = 'No restrictions';
      } else if (walletAddresses.length && !userWallet) {
        reason = 'Connect your wallet to check eligibility';
      } else if (walletAddresses.length && userWallet && !walletAddresses.includes(userWallet)) {
        reason = 'Your wallet is not in the allowed list. Try a coupon if you have one.';
      } else if (couponCodes.length && (!couponCode || !couponCodes.includes((couponCode || '').trim()))) {
        reason = 'Valid coupon required or connect an allowed wallet';
      }
    } else {
      if (couponCode && couponCodes.includes((couponCode || '').trim())) {
        reason = 'Log in or register to claim';
      } else {
        reason = 'Log in and connect your wallet or enter a valid coupon';
      }
    }

    res.json({
      canClaim: !!canClaim,
      reason: reason || undefined,
      paidDeliveryByUser: item.paidDeliveryByUser !== false,
      claimed: false,
      claimType,
      claimWindowStart: item.claimWindowStart || null,
      claimWindowEnd: item.claimWindowEnd || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

/** Claim: validate wallet or coupon, create order + GiveawayClaim. Requires auth. */
const claim = async (req, res) => {
  try {
    const {
      giveawayId,
      productId,
      deliveryMethodId,
      shippingAddressId,
      couponCode,
      paidDeliveryByUser,
      paymentOnDelivery,
    } = req.body;
    if (!giveawayId || !productId || !deliveryMethodId) {
      return res.status(400).json({
        errors: [{ msg: 'giveawayId, productId, and deliveryMethodId are required' }],
      });
    }
    if (!shippingAddressId) {
      return res.status(400).json({
        errors: [{ msg: 'Shipping address is required' }],
      });
    }

    const giveaway = await Giveaway.findById(giveawayId);
    const now = new Date();
    if (!giveaway || giveaway.expiresAt <= now) {
      return res.status(400).json({ errors: [{ msg: 'Giveaway not found or expired' }] });
    }

    const item = giveaway.items.find(
      (i) => i.product && i.product.toString() === productId
    );
    if (!item) {
      return res.status(400).json({ errors: [{ msg: 'Product not in this giveaway' }] });
    }

    const existing = await GiveawayClaim.findOne({
      giveaway: giveawayId,
      product: productId,
    });
    if (existing) {
      return res.status(400).json({ errors: [{ msg: 'This item has already been claimed' }] });
    }

    const claimType = item.claimType || 'immediate';
    const hasWindow = claimType === 'time_window' && item.claimWindowStart && item.claimWindowEnd;
    const withinWindow = hasWindow && now >= item.claimWindowStart && now <= item.claimWindowEnd;

    if (!withinWindow) {
      const walletAddresses = (item.walletAddresses || []).map(normalizeWallet).filter(Boolean);
      const couponCodes = (item.couponCodes || []).map((c) => (c || '').trim()).filter(Boolean);
      const user = await User.findById(req.user.id).select('walletAddress');
      const userWallet = normalizeWallet(user?.walletAddress);
      const codeOk = couponCode && couponCodes.includes((couponCode || '').trim());
      const walletOk = userWallet && walletAddresses.includes(userWallet);
      const noRestriction = walletAddresses.length === 0 && couponCodes.length === 0;
      if (!walletOk && !codeOk && !noRestriction) {
        return res.status(403).json({
          errors: [{ msg: 'Your wallet is not in the allowed list and the coupon is invalid' }],
        });
      }
    }

    const deliveryMethod = await DeliveryMethod.findById(deliveryMethodId);
    if (!deliveryMethod) {
      return res.status(400).json({ errors: [{ msg: 'Invalid delivery method' }] });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(400).json({ errors: [{ msg: 'Product not found' }] });
    }

    const deliveryFee = deliveryMethod.price || 0;
    const effectivePaidDeliveryByUser = item.paidDeliveryByUser !== false && paidDeliveryByUser !== false;
    const payOnDelivery = effectivePaidDeliveryByUser && (paymentOnDelivery === true || paymentOnDelivery === 'true');

    // When user must pay delivery but did not choose "payment on delivery", they must use the payment flow (start-delivery-payment)
    if (effectivePaidDeliveryByUser && !payOnDelivery) {
      return res.status(400).json({
        errors: [{ msg: 'Uncheck "Payment on delivery" and use the payment method below to pay the delivery fee now.' }],
      });
    }

    const currency = deliveryMethod.currency || 'USDC';

    // Time-window enforcement (claimType/hasWindow already set above)
    if (hasWindow && (now < item.claimWindowStart || now > item.claimWindowEnd)) {
      return res.status(403).json({
        errors: [{ msg: 'Claim not within allowed time window' }],
      });
    }
    const order = new Order({
      buyer: req.user.id,
      deliveryMethod: deliveryMethodId,
      subTotal: 0,
      deliveryFee,
      taxAmount: 0,
      discountAmount: product.price || 0,
      totalAmount: deliveryFee,
      currency: currency === 'USDT' ? 'USDC' : currency,
      status: 'confirmed',
      paymentStatus: payOnDelivery ? 'unpaid' : 'paid',
      paymentMethod: 'giveaway',
      isGiveaway: true,
      paymentOnDelivery: !!payOnDelivery,
      shippingAddress: shippingAddressId,
      paidDeliveryByUser: !!effectivePaidDeliveryByUser,
      notes: `Giveaway: ${giveaway.name}`,
    });
    await order.save();

    const snapshot = {
      name: product.name,
      description: product.description,
      images: product.images && product.images.length ? product.images : [],
      price: product.price,
      currency: product.currency || 'USDC',
      productId: product._id,
    };
    const orderItem = new OrderItem({
      order: order._id,
      product: product._id,
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      currency: order.currency,
      status: 'ordered',
      productImage: (product.images && product.images[0]) || '/images/desktop-1.png',
      productName: product.name,
      productSnapshot: snapshot,
    });
    await orderItem.save();
    order.items = [orderItem._id];
    await order.save();

    const claimDoc = new GiveawayClaim({
      giveaway: giveawayId,
      product: productId,
      user: req.user.id,
      order: order._id,
    });
    await claimDoc.save();

    // Mark giveaway item as claimed
    try {
      const itemDoc = giveaway.items.id(item._id);
      if (itemDoc) {
        itemDoc.claimed = true;
        await giveaway.save();
      } else {
        await Giveaway.updateOne(
          { _id: giveawayId, 'items._id': item._id },
          { $set: { 'items.$.claimed': true } }
        );
      }
    } catch (e) {
      console.warn('Failed to mark giveaway item as claimed', e?.message);
    }

    const populated = await Order.findById(order._id)
      .populate('deliveryMethod', 'name price currency estimatedDeliveryTime')
      .populate('items')
      .lean();

    res.status(201).json({
      order: populated,
      claim: { id: claimDoc._id, claimedAt: claimDoc.claimedAt },
      message: 'Giveaway claimed successfully',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

/** Start delivery payment: create pending giveaway order, return crypto payment details. Does not create GiveawayClaim until payment is confirmed. */
const startDeliveryPayment = async (req, res) => {
  try {
    const {
      giveawayId,
      productId,
      deliveryMethodId,
      shippingAddressId,
      currency = 'USDC',
      network = 'base',
      walletAddress: requestWalletAddress,
    } = req.body;
    if (!giveawayId || !productId || !deliveryMethodId || !shippingAddressId) {
      return res.status(400).json({
        errors: [{ msg: 'giveawayId, productId, deliveryMethodId, and shippingAddressId are required' }],
      });
    }

    const giveaway = await Giveaway.findById(giveawayId);
    const now = new Date();
    if (!giveaway || giveaway.expiresAt <= now) {
      return res.status(400).json({ errors: [{ msg: 'Giveaway not found or expired' }] });
    }
    const item = giveaway.items.find((i) => i.product && i.product.toString() === productId);
    if (!item) {
      return res.status(400).json({ errors: [{ msg: 'Product not in this giveaway' }] });
    }

    const existing = await GiveawayClaim.findOne({ giveaway: giveawayId, product: productId });
    if (existing) {
      return res.status(400).json({ errors: [{ msg: 'This item has already been claimed' }] });
    }

    const claimType = item.claimType || 'immediate';
    const hasWindow = claimType === 'time_window' && item.claimWindowStart && item.claimWindowEnd;
    const withinWindow = hasWindow && now >= item.claimWindowStart && now <= item.claimWindowEnd;
    if (!withinWindow) {
      const walletAddresses = (item.walletAddresses || []).map(normalizeWallet).filter(Boolean);
      const couponCodes = (item.couponCodes || []).map((c) => (c || '').trim()).filter(Boolean);
      const user = await User.findById(req.user.id).select('walletAddress');
      const userWallet = normalizeWallet(user?.walletAddress);
      const noRestriction = walletAddresses.length === 0 && couponCodes.length === 0;
      const walletOk = userWallet && walletAddresses.includes(userWallet);
      if (!walletOk && !noRestriction) {
        return res.status(403).json({
          errors: [{ msg: 'Your wallet is not in the allowed list' }],
        });
      }
    }
    if (hasWindow && (now < item.claimWindowStart || now > item.claimWindowEnd)) {
      return res.status(403).json({ errors: [{ msg: 'Claim not within allowed time window' }] });
    }

    const deliveryMethod = await DeliveryMethod.findById(deliveryMethodId);
    if (!deliveryMethod) {
      return res.status(400).json({ errors: [{ msg: 'Invalid delivery method' }] });
    }
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(400).json({ errors: [{ msg: 'Product not found' }] });
    }
    const shippingAddress = await DeliveryAddress.findById(shippingAddressId);
    if (!shippingAddress) {
      return res.status(400).json({ errors: [{ msg: 'Invalid shipping address' }] });
    }

    const orderCurrency = currency === 'USDT' ? 'USDC' : currency;
    const dmCurrency = (deliveryMethod.currency || 'USDC').toUpperCase();
    const dmPrice = deliveryMethod.price || 0;
    let totalAmount = dmPrice;
    let deliveryFeeInOrderCurrency = dmPrice;
    if (dmCurrency !== orderCurrency) {
      try {
        const rates = await currencyExchangeService.getOrCreateRates();
        const fromCur = dmCurrency === 'USDT' ? 'USDC' : dmCurrency;
        totalAmount = currencyExchangeService.convert(dmPrice, fromCur, orderCurrency, rates);
        deliveryFeeInOrderCurrency = totalAmount;
      } catch (e) {
        if (dmCurrency === 'NGN' && (orderCurrency === 'USDC' || orderCurrency === 'USD')) {
          totalAmount = dmPrice / NGN_PER_USD;
          deliveryFeeInOrderCurrency = totalAmount;
        } else if ((dmCurrency === 'USDC' || dmCurrency === 'USD') && orderCurrency === 'NGN') {
          totalAmount = dmPrice * NGN_PER_USD;
          deliveryFeeInOrderCurrency = totalAmount;
        }
      }
    }

    const order = new Order({
      buyer: req.user.id,
      deliveryMethod: deliveryMethodId,
      shippingAddress: shippingAddressId,
      subTotal: 0,
      deliveryFee: deliveryFeeInOrderCurrency,
      taxAmount: 0,
      discountAmount: product.price || 0,
      totalAmount,
      currency: orderCurrency,
      status: 'pending',
      paymentStatus: 'unpaid',
      paymentMethod: 'crypto',
      paymentNetwork: network,
      isGiveaway: true,
      paidDeliveryByUser: true,
      giveawayId,
      giveawayProductId: productId,
      notes: `Giveaway delivery: ${giveaway.name}`,
      requiredConfirmations: 3,
    });
    await order.save();

    if (requestWalletAddress && /^0x[0-9a-fA-F]{40}$/.test(requestWalletAddress)) {
      const user = await User.findById(req.user.id);
      if (user && !user.walletAddress) {
        user.walletAddress = requestWalletAddress;
        await user.save();
      }
    }

    const blockchainPaymentService = require('../services/blockchainPaymentService');
    const userId = String(req.user.id || req.user._id);
    let userDoc = await User.findById(userId);
    let paymentAddress;
    if (userDoc && userDoc.cryptoPaymentAddress) {
      paymentAddress = userDoc.cryptoPaymentAddress;
    } else {
      paymentAddress = blockchainPaymentService.generatePaymentAddressForUser(userId);
      if (!userDoc) userDoc = await User.findById(userId);
      if (userDoc) {
        userDoc.cryptoPaymentAddress = paymentAddress;
        await userDoc.save();
      }
    }
    order.paymentAddress = paymentAddress;
    order.paymentExpiry = new Date(Date.now() + 30 * 60 * 1000);
    await order.save();

    const snapshot = {
      name: product.name,
      description: product.description,
      images: product.images && product.images.length ? product.images : [],
      price: product.price,
      currency: product.currency || 'USDC',
      productId: product._id,
    };
    const orderItem = new OrderItem({
      order: order._id,
      product: product._id,
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      currency: order.currency,
      status: 'ordered',
      productImage: (product.images && product.images[0]) || '/images/desktop-1.png',
      productName: product.name,
      productSnapshot: snapshot,
    });
    await orderItem.save();
    order.items = [orderItem._id];
    await order.save();

    let qrCodeDataUrl = null;
    try {
      const QRCode = require('qrcode');
      const paymentURI = `${network === 'ethereum' ? 'ethereum' : network}:${paymentAddress}?value=${totalAmount}`;
      qrCodeDataUrl = await QRCode.toDataURL(paymentURI);
    } catch (qrErr) {
      console.error('Error generating QR for giveaway payment:', qrErr);
    }

    res.status(200).json({
      orderId: order._id.toString(),
      paymentAddress,
      amount: totalAmount,
      currency: orderCurrency,
      network,
      qrCode: qrCodeDataUrl,
      expiry: order.paymentExpiry,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

/** Start Seerbit delivery payment (NGN): create pending giveaway order, initialize Seerbit, return redirect link. */
const startSeerbitDeliveryPayment = async (req, res) => {
  try {
    const { giveawayId, productId, deliveryMethodId, shippingAddressId } = req.body;
    if (!giveawayId || !productId || !deliveryMethodId || !shippingAddressId) {
      return res.status(400).json({
        errors: [{ msg: 'giveawayId, productId, deliveryMethodId, and shippingAddressId are required' }],
      });
    }

    const giveaway = await Giveaway.findById(giveawayId);
    const now = new Date();
    if (!giveaway || giveaway.expiresAt <= now) {
      return res.status(400).json({ errors: [{ msg: 'Giveaway not found or expired' }] });
    }
    const item = giveaway.items.find((i) => i.product && i.product.toString() === productId);
    if (!item) {
      return res.status(400).json({ errors: [{ msg: 'Product not in this giveaway' }] });
    }

    const existing = await GiveawayClaim.findOne({ giveaway: giveawayId, product: productId });
    if (existing) {
      return res.status(400).json({ errors: [{ msg: 'This item has already been claimed' }] });
    }

    const claimType = item.claimType || 'immediate';
    const hasWindow = claimType === 'time_window' && item.claimWindowStart && item.claimWindowEnd;
    const withinWindow = hasWindow && now >= item.claimWindowStart && now <= item.claimWindowEnd;
    if (!withinWindow) {
      const walletAddresses = (item.walletAddresses || []).map(normalizeWallet).filter(Boolean);
      const couponCodes = (item.couponCodes || []).map((c) => (c || '').trim()).filter(Boolean);
      const user = await User.findById(req.user.id).select('walletAddress');
      const userWallet = normalizeWallet(user?.walletAddress);
      const noRestriction = walletAddresses.length === 0 && couponCodes.length === 0;
      const walletOk = userWallet && walletAddresses.includes(userWallet);
      if (!walletOk && !noRestriction) {
        return res.status(403).json({ errors: [{ msg: 'Your wallet is not in the allowed list' }] });
      }
    }
    if (hasWindow && (now < item.claimWindowStart || now > item.claimWindowEnd)) {
      return res.status(403).json({ errors: [{ msg: 'Claim not within allowed time window' }] });
    }

    const deliveryMethod = await DeliveryMethod.findById(deliveryMethodId);
    if (!deliveryMethod) {
      return res.status(400).json({ errors: [{ msg: 'Invalid delivery method' }] });
    }
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(400).json({ errors: [{ msg: 'Product not found' }] });
    }
    const shippingAddress = await DeliveryAddress.findById(shippingAddressId);
    if (!shippingAddress) {
      return res.status(400).json({ errors: [{ msg: 'Invalid shipping address' }] });
    }

    const dmCurrency = (deliveryMethod.currency || 'NGN').toUpperCase();
    const dmPrice = deliveryMethod.price || 0;
    let totalAmountNGN = dmPrice;
    if (dmCurrency !== 'NGN') {
      try {
        const rates = await currencyExchangeService.getOrCreateRates();
        const fromCur = dmCurrency === 'USDT' ? 'USDC' : dmCurrency;
        totalAmountNGN = currencyExchangeService.convert(dmPrice, fromCur, 'NGN', rates);
      } catch (e) {
        totalAmountNGN = (dmCurrency === 'USDC' || dmCurrency === 'USD') ? dmPrice * NGN_PER_USD : dmPrice;
      }
    }
    const amountForSeerbit = String(Math.round(totalAmountNGN));

    const order = new Order({
      buyer: req.user.id,
      deliveryMethod: deliveryMethodId,
      shippingAddress: shippingAddressId,
      subTotal: 0,
      deliveryFee: totalAmountNGN,
      taxAmount: 0,
      discountAmount: product.price || 0,
      totalAmount: totalAmountNGN,
      currency: 'NGN',
      status: 'pending',
      paymentStatus: 'unpaid',
      paymentMethod: 'seerbit',
      isGiveaway: true,
      paidDeliveryByUser: true,
      giveawayId,
      giveawayProductId: productId,
      notes: `Giveaway delivery: ${giveaway.name}`,
    });
    await order.save();

    const seerbitReference = seerbitService.generateReference();
    order.seerbitReference = seerbitReference;
    order.paymentReference = seerbitReference;
    await order.save();

    const snapshot = {
      name: product.name,
      description: product.description,
      images: product.images && product.images.length ? product.images : [],
      price: product.price,
      currency: product.currency || 'USDC',
      productId: product._id,
    };
    const orderItem = new OrderItem({
      order: order._id,
      product: product._id,
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      currency: 'NGN',
      status: 'ordered',
      productImage: (product.images && product.images[0]) || '/images/desktop-1.png',
      productName: product.name,
      productSnapshot: snapshot,
    });
    await orderItem.save();
    order.items = [orderItem._id];
    await order.save();

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
      callbackUrl,
    });

    return res.status(200).json({
      orderId: order._id.toString(),
      redirectLink: seerbitResult.redirectLink,
      reference: seerbitReference,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

// ---- Admin ----

const adminList = async (req, res) => {
  try {
    const giveaways = await Giveaway.find()
      .populate('items.product', 'name slug price images')
      .sort({ date: -1 })
      .lean();
    res.json(giveaways);
  } catch (err) {
    console.error(err);
    res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

const adminGet = async (req, res) => {
  try {
    const g = await Giveaway.findById(req.params.id)
      .populate('items.product', 'name slug price images');
    if (!g) return res.status(404).json({ errors: [{ msg: 'Giveaway not found' }] });
    res.json(g);
  } catch (err) {
    console.error(err);
    res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

const adminCreate = async (req, res) => {
  try {
    const { name, expiresAt, items } = req.body;
    if (!name || !expiresAt || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        errors: [{ msg: 'name, expiresAt, and items (array with productId, couponCodes or walletAddresses) are required' }],
      });
    }
    const docs = [];
    for (const it of items) {
      if (!it.productId) continue;
      const product = await Product.findById(it.productId);
      if (!product) continue;
      const claimType = it.claimType === 'time_window' ? 'time_window' : 'immediate';
      const doc = {
        product: product._id,
        name: it.name || product.name,
        couponCodes: Array.isArray(it.couponCodes) ? it.couponCodes.map((c) => String(c).trim()).filter(Boolean) : [],
        walletAddresses: Array.isArray(it.walletAddresses) ? it.walletAddresses.map((a) => String(a).trim()).filter(Boolean) : [],
        paidDeliveryByUser: it.paidDeliveryByUser !== false,
        claimType,
        claimWindowStart: claimType === 'time_window' && it.claimWindowStart ? new Date(it.claimWindowStart) : null,
        claimWindowEnd: claimType === 'time_window' && it.claimWindowEnd ? new Date(it.claimWindowEnd) : null,
      };
      docs.push(doc);
    }
    if (docs.length === 0) {
      return res.status(400).json({ errors: [{ msg: 'At least one valid item with productId is required' }] });
    }
    const giveaway = new Giveaway({
      name: String(name).trim(),
      expiresAt: new Date(expiresAt),
      items: docs,
    });
    await giveaway.save();
    const populated = await Giveaway.findById(giveaway._id).populate('items.product', 'name slug price images');
    res.status(201).json(populated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

const adminUpdate = async (req, res) => {
  try {
    const g = await Giveaway.findById(req.params.id);
    if (!g) return res.status(404).json({ errors: [{ msg: 'Giveaway not found' }] });
    const { name, expiresAt, items } = req.body;
    if (name !== undefined) g.name = String(name).trim();
    if (expiresAt !== undefined) g.expiresAt = new Date(expiresAt);
    if (Array.isArray(items)) {
      const docs = [];
      for (const it of items) {
        if (!it.productId) continue;
        const product = await Product.findById(it.productId);
        if (!product) continue;
        const claimType = it.claimType === 'time_window' ? 'time_window' : 'immediate';
        docs.push({
          product: product._id,
          name: it.name || product.name,
          couponCodes: Array.isArray(it.couponCodes) ? it.couponCodes.map((c) => String(c).trim()).filter(Boolean) : [],
          walletAddresses: Array.isArray(it.walletAddresses) ? it.walletAddresses.map((a) => String(a).trim()).filter(Boolean) : [],
          paidDeliveryByUser: it.paidDeliveryByUser !== false,
          claimType,
          claimWindowStart: claimType === 'time_window' && it.claimWindowStart ? new Date(it.claimWindowStart) : null,
          claimWindowEnd: claimType === 'time_window' && it.claimWindowEnd ? new Date(it.claimWindowEnd) : null,
        });
      }
      if (docs.length) g.items = docs;
    }
    await g.save();
    const populated = await Giveaway.findById(g._id).populate('items.product', 'name slug price images');
    res.json(populated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

const adminDelete = async (req, res) => {
  try {
    const g = await Giveaway.findByIdAndDelete(req.params.id);
    if (!g) return res.status(404).json({ errors: [{ msg: 'Giveaway not found' }] });
    res.json({ message: 'Giveaway deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

module.exports = {
  list,
  checkClaim,
  claim,
  startDeliveryPayment,
  startSeerbitDeliveryPayment,
  adminList,
  adminGet,
  adminCreate,
  adminUpdate,
  adminDelete,
};
