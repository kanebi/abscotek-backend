const mongoose = require('mongoose');

// Utility to generate URL-friendly slugs
function generateSlug(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const SpecSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const ProductSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
      index: true,
    },
    slug: {
      type: String,
      required: false,
      unique: true,
      index: true,
      sparse: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0.01,
    },
    currency: {
      type: String,
      enum: ['USDT'],
      default: 'USDT',
    },
    images: {
      type: [
        {
          type: String,
          validate: {
            validator: function (v) {
              // Allow empty string skip, otherwise require URL-like format
              return (
                typeof v === 'string' &&
                /^https?:\/\//i.test(v)
              );
            },
            message: 'Image must be a valid URL',
          },
        },
      ],
      default: [],
    },
    badge: { type: String, default: null },
    category: { type: String, default: null, index: true },
    brand: { type: String, default: null },
    sku: { type: String, default: null },
    specs: { type: [SpecSchema], default: [] },
    stock: { type: Number, default: 0, min: 0 },
    outOfStock: { type: Boolean, default: true },
    published: { type: Boolean, default: true },
    variants: [{
      name: { type: String, required: true },
      price: { type: Number, required: true, min: 0 },
      currency: { type: String, enum: ['USDT'], default: 'USDT' },
      stock: { type: Number, default: 0, min: 0 },
      sku: { type: String, default: null },
      attributes: [{
        name: { type: String, required: true },
        value: { type: String, required: true }
      }],
      images: {
        type: [{
          type: String,
          validate: {
            validator: function (v) {
              return (
                typeof v === 'string' &&
                /^https?:\/\//i.test(v)
              );
            },
            message: 'Image must be a valid URL',
          },
        }],
        default: [],
      },
    }],
  },
  { timestamps: true }
);

// Text index for name to support search
ProductSchema.index({ name: 'text' });

// Virtual field for first image
ProductSchema.virtual('firstImage').get(function() {
  if (this.images && this.images.length > 0) {
    return this.images[0];
  }
  return null;
});

// Ensure virtual fields are included when converting to JSON
ProductSchema.set('toJSON', { virtuals: true });
ProductSchema.set('toObject', { virtuals: true });

// Derive slug before validation if missing
ProductSchema.pre('validate', async function (next) {
  try {
    if (!this.slug && this.name) {
      let base = generateSlug(this.name);
      if (!base) {
        return next(new Error('Unable to generate slug from name'));
      }

      // Ensure uniqueness by appending incrementing suffix when necessary
      let candidate = base;
      let suffix = 1;
      const Model = this.constructor;
      while (await Model.exists({ slug: candidate, _id: { $ne: this._id } })) {
        suffix += 1;
        candidate = `${base}-${suffix}`;
      }
      this.slug = candidate;
    }

    // Derive outOfStock from stock or variants
    if (this.variants && this.variants.length > 0) {
      this.stock = this.variants.reduce((total, variant) => total + (variant.stock || 0), 0);
    }
    this.outOfStock = (this.stock ?? 0) <= 0;
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('Product', ProductSchema);
