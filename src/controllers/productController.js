const Product = require('../models/Product');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

// Helpers
function buildError(msg, status = 400) {
  return { status, body: { errors: [{ msg }] } };
}

function parsePagination(query) {
  const page = Math.max(parseInt(query.page || '1', 10), 1);
  const limit = Math.max(Math.min(parseInt(query.limit || '12', 10), 100), 1);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function parseSort(sortParam) {
  if (!sortParam) return { createdAt: -1 };
  if (sortParam === 'newest') return { createdAt: -1 };
  if (sortParam.startsWith('price:')) {
    return { price: sortParam.endsWith(':desc') ? -1 : 1 };
  }
  if (sortParam === 'popularity') return { createdAt: -1 }; // Placeholder
  return { createdAt: -1 };
}

// @desc    Create a product (admin/vendor)
// @route   POST /api/admin/products
// @access  Private (admin|vendor)
const createProduct = async (req, res) => {
  try {
    // Basic validations according to spec
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array().map(e => ({ msg: e.msg })) });
    }

    const {
      name,
      description = '',
      price,
      currency = 'USDT',
      images = [],
      badge = null,
      category = null,
      brand = null,
      sku = null,
      specs = [],
      stock = 0,
      published = true,
      slug
    } = req.body;

    if (!name || name.length < 2 || name.length > 120) {
      const e = buildError('Product name must be between 2 and 120 characters');
      return res.status(e.status).json(e.body);
    }

    if (!price || Number(price) <= 0) {
      const e = buildError('Price must be a number greater than 0');
      return res.status(e.status).json(e.body);
    }

    const product = new Product({
      name,
      description,
      price,
      currency,
      images,
      badge,
      category,
      brand,
      sku,
      specs,
      stock,
      published,
      slug,
    });

    const saved = await product.save();
    return res.json(saved);
  } catch (err) {
    console.error(err);
    if (err.code === 11000 && err.keyPattern && err.keyPattern.slug) {
      return res.status(400).json({ errors: [{ msg: 'Slug already exists' }] });
    }
    return res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

// @desc    Get products (public) - published only
// @route   GET /api/products
// @access  Public
const getProducts = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { search, category, minPrice, maxPrice, sort } = req.query;

    const filter = { published: true };
    if (category) filter.category = category;
    if (minPrice) filter.price = { ...(filter.price || {}), $gte: Number(minPrice) };
    if (maxPrice) filter.price = { ...(filter.price || {}), $lte: Number(maxPrice) };
    if (search) filter.$text = { $search: search };

    const query = Product.find(filter).sort(parseSort(sort));

    // Support both paginated and plain array outputs; keep simple array here
    const [items, total] = await Promise.all([
      query.skip(skip).limit(limit).lean(),
      Product.countDocuments(filter),
    ]);

    // Preferred object response with pagination meta
    return res.json({ items, total, page, limit });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

// @desc    Get products (admin/vendor) - includes unpublished
// @route   GET /api/admin/products
// @access  Private
const getProductsAdmin = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { search, category, minPrice, maxPrice, sort } = req.query;

    const filter = {};
    if (category) filter.category = category;
    if (minPrice) filter.price = { ...(filter.price || {}), $gte: Number(minPrice) };
    if (maxPrice) filter.price = { ...(filter.price || {}), $lte: Number(maxPrice) };
    if (search) filter.$text = { $search: search };

    const [items, total] = await Promise.all([
      Product.find(filter)
        .sort(parseSort(sort))
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    return res.json({ items, total, page, limit });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

// @desc    Get unpublished products (admin/vendor)
// @route   GET /api/admin/products/unpublished
// @access  Private
const getUnpublishedProductsAdmin = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { search, category, minPrice, maxPrice, sort } = req.query;

    const filter = { published: false };
    if (category) filter.category = category;
    if (minPrice) filter.price = { ...(filter.price || {}), $gte: Number(minPrice) };
    if (maxPrice) filter.price = { ...(filter.price || {}), $lte: Number(maxPrice) };
    if (search) filter.$text = { $search: search };

    const [items, total] = await Promise.all([
      Product.find(filter)
        .sort(parseSort(sort))
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    return res.json({ items, total, page, limit });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

// @desc    Get product by ID or slug
// @route   GET /api/products/:idOrSlug
// @access  Public
const getProductById = async (req, res) => {
  try {
    const idOrSlug = req.params.id;
    const publishedFilter = { published: true };

    let product = null;
    if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
      product = await Product.findOne({ _id: idOrSlug, ...publishedFilter }).lean();
    }
    if (!product) {
      product = await Product.findOne({ slug: idOrSlug, ...publishedFilter }).lean();
    }

    if (!product) {
      return res.status(404).json({ errors: [{ msg: 'Product not found' }] });
    }

    return res.json(product);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

// @desc    Update a product
// @route   PUT /api/admin/products/:id
// @access  Private (admin|vendor)
const updateProduct = async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.price && Number(updates.price) <= 0) {
      return res.status(400).json({ errors: [{ msg: 'Price must be greater than 0' }] });
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    if (!product) {
      return res.status(404).json({ errors: [{ msg: 'Product not found' }] });
    }

    return res.json(product);
  } catch (err) {
    console.error(err);
    if (err.code === 11000 && err.keyPattern && err.keyPattern.slug) {
      return res.status(400).json({ errors: [{ msg: 'Slug already exists' }] });
    }
    return res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

// @desc    Delete a product
// @route   DELETE /api/admin/products/:id
// @access  Private (admin|vendor)
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id).lean();
    if (!product) {
      return res.status(404).json({ errors: [{ msg: 'Product not found' }] });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

// @desc    Get related products by category or brand
// @route   GET /api/products/:idOrSlug/related
// @access  Public
const getRelatedProducts = async (req, res) => {
  try {
    const idOrSlug = req.params.id;
    let current = null;
    if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
      current = await Product.findById(idOrSlug).lean();
    }
    if (!current) {
      current = await Product.findOne({ slug: idOrSlug }).lean();
    }
    if (!current) {
      return res.status(404).json({ errors: [{ msg: 'Product not found' }] });
    }

    const limit = Math.max(parseInt(req.query.limit || '8', 10), 1);
    const filter = {
      published: true,
      _id: { $ne: current._id },
      $or: [
        current.category ? { category: current.category } : null,
        current.brand ? { brand: current.brand } : null,
      ].filter(Boolean),
    };

    // If neither category nor brand, just return latest published
    if (filter.$or.length === 0) delete filter.$or;

    const related = await Product.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json(related);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

// Admin helpers
const setPublishStatus = async (req, res) => {
  try {
    const { published } = req.body;
    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: { published: Boolean(published) } },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ errors: [{ msg: 'Product not found' }] });
    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

const updateInventory = async (req, res) => {
  try {
    const { stock } = req.body;
    if (stock == null || Number(stock) < 0) {
      return res.status(400).json({ errors: [{ msg: 'Stock must be a non-negative number' }] });
    }
    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: { stock: Number(stock) } },
      { new: true, runValidators: true }
    ).lean();
    if (!updated) return res.status(404).json({ errors: [{ msg: 'Product not found' }] });
    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

// Placeholder for images and bulk endpoints (implement storage later)
const { saveImage } = require('../config/storage');

const uploadImages = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ errors: [{ msg: 'Product not found' }] });

    // Accept both multipart buffers and JSON URLs
    const urls = Array.isArray(req.body?.images) ? req.body.images.filter(Boolean) : [];

    const files = Array.isArray(req.files) ? req.files : [];

    // Here we only demonstrate a simple in-memory-to-base64 approach or mock URL builder.
    // In production, forward buffers to S3/Cloudinary and store returned URLs.
    const generatedUrls = [];
    for (const f of files) {
      try {
        // Build server origin from request for non-prod local URLs
        const origin = `${req.protocol}://${req.get('host')}`;
        const url = await saveImage(f.originalname, f.buffer, f.mimetype, origin);
        generatedUrls.push(url);
      } catch (e) {
        console.error('Image save error:', e.message);
      }
    }

    // Normalize any non-https URLs by prefixing origin so schema URL validator passes
    const origin = `${req.protocol}://${req.get('host')}`;
    const normalizeUrl = (u) => {
      if (typeof u !== 'string') return u;
      if (/^https?:\/\//i.test(u)) return u;
      const trimmed = u.startsWith('/') ? u : `/${u}`;
      const normalizedBase = origin.endsWith('/') ? origin.slice(0, -1) : origin;
      return `${normalizedBase}${trimmed}`;
    };

    const normalizedUrls = [...urls, ...generatedUrls].map(normalizeUrl);

    const all = [...product.images, ...normalizedUrls];

    product.images = all;
    await product.save();
    return res.json(product.toObject());
  } catch (err) {
    console.error(err);
    return res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

const removeImage = async (req, res) => {
  try {
    const { image } = req.body;
    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      { $pull: { images: image } },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ errors: [{ msg: 'Product not found' }] });
    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

const bulkUpsert = async (req, res) => {
  try {
    const payload = req.body;
    const items = Array.isArray(payload) ? payload : [];
    if (items.length === 0) return res.json({ upserted: 0, updated: 0, errors: [] });

    let upserted = 0;
    let updated = 0;
    const errors = [];

    for (const item of items) {
      try {
        const { slug, name } = item;
        let identifier = slug;
        if (!identifier && name) {
          // rely on model hook to generate slug; use name match fallback
          identifier = null;
        }

        if (identifier) {
          const resDoc = await Product.findOneAndUpdate(
            { slug: identifier },
            { $set: item },
            { upsert: true, new: true, runValidators: true }
          );
          if (resDoc.wasNew) upserted += 1; else updated += 1;
        } else {
          const doc = new Product(item);
          await doc.save();
          upserted += 1;
        }
      } catch (e) {
        errors.push({ msg: e.message });
      }
    }

    return res.json({ upserted, updated, errors });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

module.exports = {
  createProduct,
  getProducts,
  getProductsAdmin,
  getUnpublishedProductsAdmin,
  getProductById,
  updateProduct,
  deleteProduct,
  getRelatedProducts,
  setPublishStatus,
  updateInventory,
  uploadImages,
  removeImage,
  bulkUpsert,
};

