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

    let {
      name,
      description = '',
      price,
      currency = 'USDC',
      images = [],
      badge = null,
      category = null,
      brand = null,
      sku = null,
      specs = [],
      variants = [],
      stock = 0,
      published = true,
      slug
    } = req.body;

    // Convert empty strings to null for optional fields
    if (badge === '') badge = null;
    if (category === '') category = null;
    if (brand === '') brand = null;
    if (sku === '') sku = null;

    console.log('req.body.variants:', req.body.variants);
    console.log('variants after destructuring:', variants);

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
      variants,
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
    const { search, category, minPrice, maxPrice, sort, color, size, brand } = req.query;

    const filter = { published: true };

    // Category filter - support multiple categories and normalize "phones" to "Smartphones"
    if (category) {
      const normalizeCategory = (cat) => {
        const categoryMap = {
          'phones': 'Smartphones',
          'phone': 'Smartphones',
          'Phones': 'Smartphones',
          'Phone': 'Smartphones'
        };
        return categoryMap[cat] || cat;
      };
      
      const categories = Array.isArray(category) ? category : category.split(',');
      const normalizedCategories = categories.map(cat => normalizeCategory(cat));
      filter.category = { $in: normalizedCategories };
    }

    // Brand filter - support multiple brands
    if (brand) {
      const brands = Array.isArray(brand) ? brand : brand.split(',');
      filter.brand = { $in: brands };
    }

    // Price range filter
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    // Text search
    if (search) filter.$text = { $search: search };

    // Advanced filtering using specs and variants
    const specFilters = [];
    const variantFilters = [];

    // Color filter - check both specs and variants
    if (color) {
      const colors = Array.isArray(color) ? color : color.split(',');
      specFilters.push({ specs: { $elemMatch: { label: 'Color', value: { $in: colors } } } });
      variantFilters.push({ variants: { $elemMatch: { attributes: { $elemMatch: { name: 'Color', value: { $in: colors } } } } } });
    }

    // Size filter - check both specs and variants
    if (size) {
      const sizes = Array.isArray(size) ? size : size.split(',');
      specFilters.push({ specs: { $elemMatch: { label: 'Size', value: { $in: sizes } } } });
      variantFilters.push({ variants: { $elemMatch: { attributes: { $elemMatch: { name: 'Size', value: { $in: sizes } } } } } });
    }

    // Combine filters - products must match at least one of the spec filters OR one of the variant filters
    if (specFilters.length > 0 || variantFilters.length > 0) {
      const orConditions = [];
      if (specFilters.length > 0) orConditions.push(...specFilters);
      if (variantFilters.length > 0) orConditions.push(...variantFilters);

      if (orConditions.length > 0) {
        filter.$or = orConditions;
      }
    }

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
    const { search, category, minPrice, maxPrice, sort, color, size, brand } = req.query;

    const filter = {};

    // Category filter - support multiple categories
    if (category) {
      const categories = Array.isArray(category) ? category : category.split(',');
      filter.category = { $in: categories };
    }

    // Brand filter - support multiple brands
    if (brand) {
      const brands = Array.isArray(brand) ? brand : brand.split(',');
      filter.brand = { $in: brands };
    }

    // Price range filter
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    // Text search
    if (search) filter.$text = { $search: search };

    // Advanced filtering using specs and variants
    const specFilters = [];
    const variantFilters = [];

    // Color filter - check both specs and variants
    if (color) {
      const colors = Array.isArray(color) ? color : color.split(',');
      specFilters.push({ specs: { $elemMatch: { label: 'Color', value: { $in: colors } } } });
      variantFilters.push({ variants: { $elemMatch: { attributes: { $elemMatch: { name: 'Color', value: { $in: colors } } } } } });
    }

    // Size filter - check both specs and variants
    if (size) {
      const sizes = Array.isArray(size) ? size : size.split(',');
      specFilters.push({ specs: { $elemMatch: { label: 'Size', value: { $in: sizes } } } });
      variantFilters.push({ variants: { $elemMatch: { attributes: { $elemMatch: { name: 'Size', value: { $in: sizes } } } } } });
    }

    // Combine filters - products must match at least one of the spec filters OR one of the variant filters
    if (specFilters.length > 0 || variantFilters.length > 0) {
      const orConditions = [];
      if (specFilters.length > 0) orConditions.push(...specFilters);
      if (variantFilters.length > 0) orConditions.push(...variantFilters);

      if (orConditions.length > 0) {
        filter.$or = orConditions;
      }
    }

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

// @desc    Get single product by ID (admin/vendor) - includes unpublished
// @route   GET /api/admin/products/:id
// @access  Private (admin|vendor)
const getProductByIdAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ errors: [{ msg: 'Invalid product ID' }] });
    }

    const product = await Product.findById(id).lean();

    if (!product) {
      return res.status(404).json({ errors: [{ msg: 'Product not found' }] });
    }

    return res.json(product);
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
    const { search, category, minPrice, maxPrice, sort, color, size } = req.query;

    const filter = { published: false };
    if (category) filter.category = category;
    if (minPrice) filter.price = { ...(filter.price || {}), $gte: Number(minPrice) };
    if (maxPrice) filter.price = { ...(filter.price || {}), $lte: Number(maxPrice) };
    if (search) filter.$text = { $search: search };

    // Handle color and size filters using specs
    if (color) {
      filter.specs = { $elemMatch: { label: 'Color', value: color } };
    }
    if (size) {
      if (filter.specs) {
        // If color filter exists, combine with $and
        filter.$and = [
          { specs: { $elemMatch: { label: 'Color', value: color } } },
          { specs: { $elemMatch: { label: 'Size', value: size } } }
        ];
        delete filter.specs;
      } else {
        filter.specs = { $elemMatch: { label: 'Size', value: size } };
      }
    }

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

    // Handle optional fields - convert empty strings to null for optional string fields
    const optionalStringFields = ['badge', 'category', 'brand', 'sku'];
    optionalStringFields.forEach(field => {
      if (field in updates && updates[field] === '') {
        updates[field] = null;
      }
    });

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
  getProductByIdAdmin,
  updateProduct,
  deleteProduct,
  getRelatedProducts,
  setPublishStatus,
  updateInventory,
  uploadImages,
  removeImage,
  bulkUpsert,
};

