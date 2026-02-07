const Cart = require('../models/Cart');
const Product = require('../models/Product');

// @desc    Update item quantity in cart
// @route   PUT /api/cart
// @access  Private
const updateItemQuantity = async (req, res) => {
  try {
    const { productId, quantity, variantName, specs } = req.body;

    if (!productId || typeof quantity !== 'number' || quantity < 1) {
      return res.status(400).json({ msg: 'productId and positive quantity are required' });
    }

    let cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      return res.status(404).json({ msg: 'Cart not found' });
    }

    // Match item by productId, variant, and specs for precise identification
    const itemIndex = cart.items.findIndex(
      (item) => item.productId.toString() === productId &&
                item.variant?.name === variantName &&
                JSON.stringify(item.specs || []) === JSON.stringify(specs || []) &&
                item.status === 'active'
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
    await cart.populate('items.product', 'name price images firstImage');

    // Filter out ordered items and ensure each active cart item has the product image properly mapped
    if (cart && cart.items) {
      cart.items = cart.items
        .filter(item => item.status !== 'ordered') // Only return active items
        .map(item => ({
          ...item.toObject(),
          image: item.product?.image || item.image, // Use image from product or fallback to existing image
          name: item.product?.name || item.name,
          price: item.unitPrice || item.product?.price || item.price
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
    let cart = await Cart.findOne({ user: req.user.id });

    // Filter out ordered items and ensure each active cart item has the product image properly mapped
    if (cart && cart.items) {
      cart.items = await Promise.all(cart.items
        .filter(item => item.status !== 'ordered') // Only return active items
        .map(async (item) => {
          // Always populate fresh product data to ensure images are included
          const Product = require('../models/Product');
          const fullProduct = await Product.findById(item.productId).select('name price images firstImage').lean();

          console.log('Backend - Product data for cart item:', {
            productId: item.productId,
            productName: fullProduct?.name,
            hasImages: !!fullProduct?.images,
            imagesLength: fullProduct?.images?.length || 0,
            images: fullProduct?.images,
            firstImage: fullProduct?.firstImage
          });

          // Use unitPrice as the primary price (includes variant price if variant is selected)
          // This ensures the product.price reflects the actual price for this cart item
          const itemPrice = item.unitPrice || fullProduct?.price || item.product?.price || item.price;
          
          const processedItem = {
            ...item.toObject(),
            product: {
              _id: fullProduct?._id || item.productId,
              name: fullProduct?.name || item.product?.name || item.name || 'Product',
              price: itemPrice, // Use unitPrice (includes variant) as product price
              images: fullProduct?.images || item.product?.images || [],
              firstImage: fullProduct?.firstImage || item.product?.firstImage
            },
            productId: item.productId,
            image: fullProduct?.images?.[0] || fullProduct?.firstImage || item.product?.images?.[0] || item.image,
            images: fullProduct?.images || item.product?.images || [item.image],
            name: fullProduct?.name || item.product?.name || item.name,
            price: itemPrice // Use unitPrice (includes variant) as item price
          };

          console.log('Backend - Processed cart item:', {
            productId: processedItem.productId,
            name: processedItem.name,
            image: processedItem.image,
            imagesCount: processedItem.images?.length || 0
          });

          return processedItem;
        }));

      // Recalculate totals based on active items only
      cart.subtotal = cart.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
      cart.total = cart.subtotal + (cart.deliveryFee || 0) - (cart.discount || 0);
    }

    if (!cart) {
      cart = new Cart({
        user: req.user.id,
        currency: 'USDC',
        subtotal: 0,
        total: 0,
        items: []
      });
      await cart.save();
    }

    console.log('Backend - Final cart response:', {
      itemCount: cart.items?.length || 0,
      firstItem: cart.items?.[0] ? {
        name: cart.items[0].name,
        hasImage: !!cart.items[0].image,
        image: cart.items[0].image,
        imagesCount: cart.items[0].images?.length || 0
      } : null
    });

    res.json(cart);
  } catch (err) {
    console.error('Cart fetch error:', err.message);
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
      cart.items = await Promise.all(cart.items
        .filter(item => item.status !== 'ordered') // Only return active items
        .map(async (item) => {
          // Populate product data if not already populated
          if (!item.product || !item.product.name) {
            const Product = require('../models/Product');
            const fullProduct = await Product.findById(item.productId).select('name price images firstImage').lean();
            if (fullProduct) {
              item.product = fullProduct;
            }
          }

          return {
            ...item.toObject(),
            image: item.product?.images?.[0] || item.product?.firstImage || item.image,
            images: item.product?.images || [item.image],
            name: item.product?.name || item.name,
            price: item.unitPrice || item.product?.price || item.price
          };
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
    let { productId, quantity, currency, variantName, specs } = req.body;
    
    // Mutual exclusion: if variant is selected, clear specs; if specs are selected, clear variant
    if (variantName) {
      specs = null;
    } else if (specs && specs.length > 0) {
      variantName = null;
    }

    let cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      cart = new Cart({
        user: req.user.id,
        currency: currency || 'USDC',
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
    // Use variant price if available, otherwise use product price
    const finalPrice = variant?.price || product.price;
    const finalCurrency = variant?.currency || product.currency || currency || 'USDC';

    // Check for existing item with same product, variant, and specs
    const itemIndex = cart.items.findIndex(
      (item) => item.productId.toString() === productId &&
                item.variant?.name === variantName &&
                JSON.stringify(item.specs || []) === JSON.stringify(specs || []) &&
                item.status === 'active'
    );

    if (itemIndex > -1) {
      // Update existing item quantity
      cart.items[itemIndex].quantity += quantity || 1;
      // Ensure quantity doesn't go below 1
      if (cart.items[itemIndex].quantity < 1) {
        cart.items[itemIndex].quantity = 1;
      }
    } else {
      cart.items.push({
        productId: productId,
        product: {
          _id: product._id,
          name: product.name,
          price: finalPrice,
          image: product.image,
          slug: product.slug,
          currency: finalCurrency
        },
        variant: variant ? {
          name: variant.name,
          price: variant.price,
          currency: variant.currency,
          attributes: variant.attributes || [],
          additionalPrice: variant.additionalPrice || 0
        } : null,
        specs: specs || null,
        quantity: quantity || 1,
        unitPrice: finalPrice,
        currency: finalCurrency,
        status: 'active'
      });
    }

    // Calculate totals based on active items only
    const activeItems = cart.items.filter(item => item.status === 'active');
    cart.subtotal = activeItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    cart.total = cart.subtotal + (cart.deliveryFee || 0) - (cart.discount || 0);

    // Ensure cart has required fields
    if (!cart.currency) cart.currency = currency || 'USDC';

    await cart.save();
    await cart.populate('items.product', 'name price images firstImage');

    // Filter out ordered items and ensure each active cart item has the product image properly mapped
    if (cart && cart.items) {
      cart.items = await Promise.all(cart.items
        .filter(item => item.status !== 'ordered') // Only return active items
        .map(async (item) => {
          // Always populate fresh product data to ensure images are included
          const Product = require('../models/Product');
          const fullProduct = await Product.findById(item.productId).select('name price images firstImage').lean();

          console.log('Backend - Add to cart - Product data for cart item:', {
            productId: item.productId,
            productName: fullProduct?.name,
            hasImages: !!fullProduct?.images,
            imagesLength: fullProduct?.images?.length || 0,
            images: fullProduct?.images,
            firstImage: fullProduct?.firstImage
          });

          // Use unitPrice as the primary price (includes variant price if variant is selected)
          // This ensures the product.price reflects the actual price for this cart item
          const itemPrice = item.unitPrice || fullProduct?.price || item.product?.price || item.price;
          
          const processedItem = {
            ...item.toObject(),
            product: {
              _id: fullProduct?._id || item.productId,
              name: fullProduct?.name || item.product?.name || item.name || 'Product',
              price: itemPrice, // Use unitPrice (includes variant) as product price
              images: fullProduct?.images || item.product?.images || [],
              firstImage: fullProduct?.firstImage || item.product?.firstImage
            },
            productId: item.productId,
            image: fullProduct?.images?.[0] || fullProduct?.firstImage || item.product?.images?.[0] || item.image,
            images: fullProduct?.images || item.product?.images || [item.image],
            name: fullProduct?.name || item.product?.name || item.name,
            price: itemPrice // Use unitPrice (includes variant) as item price
          };

          console.log('Backend - Add to cart - Processed cart item:', {
            productId: processedItem.productId,
            name: processedItem.name,
            image: processedItem.image,
            imagesCount: processedItem.images?.length || 0
          });

          return processedItem;
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
    await cart.populate('items.product', 'name price images firstImage');

    // Filter out ordered items and ensure each active cart item has the product image properly mapped
    if (cart && cart.items) {
      cart.items = cart.items
        .filter(item => item.status !== 'ordered') // Only return active items
        .map(item => ({
          ...item.toObject(),
          image: item.product?.images?.[0] || item.image, // Use first image from product images array
          images: item.product?.images || [item.image], // Include full images array
          name: item.product?.name || item.name,
          price: item.unitPrice || item.product?.price || item.price
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
