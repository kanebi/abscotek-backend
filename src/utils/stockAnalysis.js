const Product = require('../models/Product');

/**
 * Analyzes and updates stock status for a product
 * Automatically sets outOfStock based on stock quantity
 * @param {String|Object} productId - Product ID or Product document
 * @returns {Promise<Object>} Updated product with stock analysis
 */
async function analyzeAndUpdateStock(productId) {
  try {
    // Get product (either by ID or use the document directly)
    let product;
    if (typeof productId === 'string' || productId instanceof require('mongoose').Types.ObjectId) {
      product = await Product.findById(productId);
    } else {
      product = productId;
    }

    if (!product) {
      throw new Error('Product not found');
    }

    // Calculate total stock from variants if they exist
    let totalStock = product.stock || 0;
    if (product.variants && product.variants.length > 0) {
      totalStock = product.variants.reduce((total, variant) => {
        return total + (variant.stock || 0);
      }, 0);
    }

    // Update product stock and outOfStock status
    product.stock = totalStock;
    product.outOfStock = totalStock <= 0;

    // Save the product (if it's a document, not just an ID)
    if (product.isNew || product.isModified()) {
      await product.save();
    }

    return product;
  } catch (error) {
    console.error('Error in stock analysis:', error);
    throw error;
  }
}

/**
 * Reduces stock for a product and variant when an order is completed
 * @param {String} productId - Product ID
 * @param {String} variantId - Optional variant ID or variant name
 * @param {Number} quantity - Quantity to reduce
 * @returns {Promise<Object>} Updated product
 */
async function reduceStockOnOrder(productId, variantId = null, quantity = 1) {
  try {
    const product = await Product.findById(productId);
    if (!product) {
      throw new Error('Product not found');
    }

    // If variant is specified, reduce variant stock
    if (variantId && product.variants && product.variants.length > 0) {
      const variant = product.variants.find(
        v => v._id.toString() === variantId.toString() || v.name === variantId
      );

      if (variant) {
        const currentStock = variant.stock || 0;
        variant.stock = Math.max(0, currentStock - quantity);
      }
    } else {
      // Reduce main product stock
      const currentStock = product.stock || 0;
      product.stock = Math.max(0, currentStock - quantity);
    }

    // Analyze and update stock status
    await analyzeAndUpdateStock(product);

    return product;
  } catch (error) {
    console.error('Error reducing stock on order:', error);
    throw error;
  }
}

module.exports = {
  analyzeAndUpdateStock,
  reduceStockOnOrder
};
