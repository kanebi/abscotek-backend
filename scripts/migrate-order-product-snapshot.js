/**
 * Migration: Backfill productSnapshot on existing OrderItem documents.
 * Run from backend directory: node scripts/migrate-order-product-snapshot.js
 * Requires: MONGODB_URI in .env (or default localhost)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const { OrderItem } = require('../src/models/Order');
const Product = require('../src/models/Product');

const PLACEHOLDER_IMAGE = '/images/desktop-1.png';

function buildSnapshotFromProduct(product, orderItem = null) {
  if (!product) {
    return {
      name: orderItem?.productName || null,
      description: null,
      images: orderItem?.productImage ? [orderItem.productImage] : [PLACEHOLDER_IMAGE],
      price: orderItem?.unitPrice ?? null,
      currency: orderItem?.currency || null,
      productId: orderItem?.product || null
    };
  }
  let images = [];
  const variantName = orderItem?.variant?.name;
  if (variantName && product.variants?.length) {
    const variant = product.variants.find(v => (v.name || '').toString() === (variantName || '').toString());
    if (variant?.images?.length) images = [...variant.images];
  }
  if (images.length === 0 && product.images?.length) {
    images = Array.isArray(product.images) ? [...product.images] : [product.images];
  }
  if (images.length === 0) images = [orderItem?.productImage || PLACEHOLDER_IMAGE];
  return {
    name: product.name || orderItem?.productName || null,
    description: product.description ?? null,
    images,
    price: product.price ?? orderItem?.unitPrice ?? null,
    currency: (product.currency === 'USDT' ? 'USDC' : product.currency) || orderItem?.currency || null,
    productId: product._id
  };
}

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/abscobackend';
  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('Connected.');

  // Items missing productSnapshot or with no images in snapshot
  const items = await OrderItem.find({
    $or: [
      { productSnapshot: { $exists: false } },
      { productSnapshot: null },
      { 'productSnapshot.images': { $exists: false } },
      { $expr: { $lte: [ { $size: { $ifNull: ['$productSnapshot.images', []] } }, 0 ] } }
    ]
  }).lean();

  console.log('Found', items.length, 'order items to update.');

  let updated = 0;
  let errors = 0;

  for (const item of items) {
    try {
      const productId = item.product;
      if (!productId) {
        const snapshot = buildSnapshotFromProduct(null, item);
        await OrderItem.updateOne(
          { _id: item._id },
          { $set: { productSnapshot: snapshot } }
        );
        updated++;
        continue;
      }

      const product = await Product.findById(productId).lean();
      const snapshot = buildSnapshotFromProduct(product, item);
      await OrderItem.updateOne(
        { _id: item._id },
        { $set: { productSnapshot: snapshot } }
      );
      updated++;
    } catch (err) {
      console.error('Error updating item', item._id, err.message);
      errors++;
    }
  }

  console.log('Done. Updated:', updated, 'Errors:', errors);
  await mongoose.disconnect();
  process.exit(errors > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
