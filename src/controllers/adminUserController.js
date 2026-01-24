const User = require('../models/User');
const bcrypt = require('bcryptjs');

/**
 * @desc    Get all users
 * @route   GET /api/admin/users
 * @access  Private (admin)
 */
const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', role } = req.query;
    
    const query = {};
    
    // Search by name or email
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Filter by role
    if (role) {
      query.role = role;
    }
    
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean();
    
    const total = await User.countDocuments(query);
    
    return res.json({
      users,
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit))
    });
  } catch (err) {
    console.error('Error fetching users:', err);
    return res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

/**
 * @desc    Get user by ID
 * @route   GET /api/admin/users/:id
 * @access  Private (admin)
 */
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password').lean();
    
    if (!user) {
      return res.status(404).json({ errors: [{ msg: 'User not found' }] });
    }
    
    return res.json(user);
  } catch (err) {
    console.error('Error fetching user:', err);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ errors: [{ msg: 'User not found' }] });
    }
    return res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

/**
 * @desc    Create a new user
 * @route   POST /api/admin/users
 * @access  Private (admin)
 */
const createUser = async (req, res) => {
  try {
    const { name, email, password, role = 'user', phone, companyName } = req.body;
    
    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ 
        errors: [{ msg: 'Name, email, and password are required' }] 
      });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ 
        errors: [{ msg: 'Password must be at least 6 characters' }] 
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ 
        errors: [{ msg: 'User with this email already exists' }] 
      });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create user
    const user = new User({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role,
      phone: phone || null,
      companyName: companyName || null,
      isVerified: true, // Admin-created users are auto-verified
    });
    
    await user.save();
    
    // Return user without password
    const userResponse = user.toObject();
    delete userResponse.password;
    
    return res.status(201).json(userResponse);
  } catch (err) {
    console.error('Error creating user:', err);
    return res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

/**
 * @desc    Update user
 * @route   PUT /api/admin/users/:id
 * @access  Private (admin)
 */
const updateUser = async (req, res) => {
  try {
    const { name, email, role, phone, companyName, isVerified, approved, password } = req.body;
    
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ errors: [{ msg: 'User not found' }] });
    }
    
    // Check if email is being changed and if it's already taken
    if (email && email.toLowerCase() !== user.email) {
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({ 
          errors: [{ msg: 'Email already in use' }] 
        });
      }
      user.email = email.toLowerCase();
    }
    
    // Update fields
    if (name) user.name = name;
    if (role) user.role = role;
    if (phone !== undefined) user.phone = phone || null;
    if (companyName !== undefined) user.companyName = companyName || null;
    if (typeof isVerified === 'boolean') user.isVerified = isVerified;
    if (typeof approved === 'boolean') user.approved = approved;
    
    // Update password if provided
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ 
          errors: [{ msg: 'Password must be at least 6 characters' }] 
        });
      }
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
    }
    
    await user.save();
    
    // Return user without password
    const userResponse = user.toObject();
    delete userResponse.password;
    
    return res.json(userResponse);
  } catch (err) {
    console.error('Error updating user:', err);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ errors: [{ msg: 'User not found' }] });
    }
    return res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

/**
 * @desc    Approve or promote user
 * @route   PATCH /api/admin/users/:id/approve
 * @access  Private (admin)
 */
const approveUser = async (req, res) => {
  try {
    const { approved, role } = req.body;
    
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ errors: [{ msg: 'User not found' }] });
    }
    
    // Prevent admin from changing their own role
    if (req.params.id === req.user.id && role && role !== user.role) {
      return res.status(400).json({ 
        errors: [{ msg: 'You cannot change your own role' }] 
      });
    }
    
    if (typeof approved === 'boolean') {
      user.approved = approved;
    }
    
    if (role && ['user', 'vendor', 'admin'].includes(role)) {
      user.role = role;
    }
    
    await user.save();
    
    // Return user without password
    const userResponse = user.toObject();
    delete userResponse.password;
    
    return res.json(userResponse);
  } catch (err) {
    console.error('Error approving user:', err);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ errors: [{ msg: 'User not found' }] });
    }
    return res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

/**
 * @desc    Delete user
 * @route   DELETE /api/admin/users/:id
 * @access  Private (admin)
 */
const deleteUser = async (req, res) => {
  try {
    // Prevent admin from deleting themselves
    if (req.params.id === req.user.id) {
      return res.status(400).json({ 
        errors: [{ msg: 'You cannot delete your own account' }] 
      });
    }
    
    const user = await User.findByIdAndDelete(req.params.id);
    
    if (!user) {
      return res.status(404).json({ errors: [{ msg: 'User not found' }] });
    }
    
    return res.json({ msg: 'User deleted successfully' });
  } catch (err) {
    console.error('Error deleting user:', err);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ errors: [{ msg: 'User not found' }] });
    }
    return res.status(500).json({ errors: [{ msg: 'Server error' }] });
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  approveUser,
};
