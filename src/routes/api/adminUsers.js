const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  createUser,
} = require('../../controllers/adminUserController');

/**
 * @route   GET /api/admin/users
 * @desc    Get all users (admin only)
 * @access  Private (admin)
 */
router.get('/', auth.admin, getAllUsers);

/**
 * @route   GET /api/admin/users/:id
 * @desc    Get user by ID (admin only)
 * @access  Private (admin)
 */
router.get('/:id', auth.admin, getUserById);

/**
 * @route   POST /api/admin/users
 * @desc    Create a new user (admin only)
 * @access  Private (admin)
 */
router.post('/', auth.admin, createUser);

/**
 * @route   PUT /api/admin/users/:id
 * @desc    Update user (admin only)
 * @access  Private (admin)
 */
router.put('/:id', auth.admin, updateUser);

/**
 * @route   DELETE /api/admin/users/:id
 * @desc    Delete user (admin only)
 * @access  Private (admin)
 */
router.delete('/:id', auth.admin, deleteUser);

module.exports = router;
