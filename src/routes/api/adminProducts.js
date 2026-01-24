const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const auth = require('../../middleware/auth');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 10 } });

const {
  createProduct,
  getProductsAdmin,
  getUnpublishedProductsAdmin,
  getProductByIdAdmin,
  updateProduct,
  deleteProduct,
  setPublishStatus,
  updateInventory,
  uploadImages,
  removeImage,
  bulkUpsert,
} = require('../../controllers/productController');

// GET /api/admin/products
router.get('/', auth.adminOrVendor, getProductsAdmin);

// GET /api/admin/products/unpublished (must be before /:id)
router.get('/unpublished', auth.adminOrVendor, getUnpublishedProductsAdmin);

// GET /api/admin/products/:id
router.get('/:id', auth.adminOrVendor, getProductByIdAdmin);

// POST /api/admin/products
router.post(
  '/',
  [
    auth.adminOrVendor,
    check('name', 'Name is required').isString().isLength({ min: 2, max: 120 }),
    check('price', 'Price must be a number greater than 0').isFloat({ gt: 0 }),
  ],
  createProduct
);

// PUT /api/admin/products/:id
router.put('/:id', auth.adminOrVendor, updateProduct);

// DELETE /api/admin/products/:id
router.delete('/:id', auth.adminOrVendor, deleteProduct);

// PATCH /api/admin/products/:id/publish
router.patch('/:id/publish', auth.adminOrVendor, setPublishStatus);

// PATCH /api/admin/products/:id/inventory
router.patch('/:id/inventory', auth.adminOrVendor, updateInventory);

// POST /api/admin/products/:id/images (multipart/form-data)
// Uses in-memory buffers; controller can forward to cloud storage/CDN
router.post('/:id/images', auth.adminOrVendor, upload.array('images', 10), uploadImages);

// DELETE /api/admin/products/:id/images
router.delete('/:id/images', auth.adminOrVendor, removeImage);

// POST /api/admin/products/bulk
router.post('/bulk', auth.adminOrVendor, bulkUpsert);

module.exports = router;

