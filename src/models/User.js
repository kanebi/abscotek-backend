const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
  },
  password: {
    type: String,
  },
  walletAddress: {
    type: String,
    unique: true,
    sparse: true,
  },
  role: {
    type: String,
    enum: ['user', 'vendor', 'admin'],
    default: 'user',
  },
  // Admin-specific fields
  companyName: {
    type: String,
  },
  phone: {
    type: String,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  approved: {
    type: Boolean,
    default: false,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  balance: {
    type: Number,
    default: 0,
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
  },
  referralCode: {
    type: String,
    unique: true,
    sparse: true, // Allows null values to not violate the unique constraint
  },
  // JWT Token fields
  jwtToken: {
    type: String,
  },
  tokenExpiry: {
    type: Date,
  },
  lastLogin: {
    type: Date,
    default: Date.now,
  },
});

UserSchema.path('email').validate(function (value) {
  if (this.role === 'admin') {
    return value && value.length;
  }
  return true;
}, 'Email is required for admin users');

UserSchema.path('password').validate(function (value) {
  if (this.role === 'admin') {
    return value && value.length;
  }
  return true;
}, 'Password is required for admin users');

UserSchema.path('companyName').validate(function (value) {
  if (this.role === 'vendor') {
    return value && value.length;
  }
  return true;
}, 'Company name is required for vendor users');

UserSchema.path('phone').validate(function (value) {
  if (this.role === 'admin') {
    return value && value.length;
  }
  return true;
}, 'Phone number is required for admin users');

module.exports = mongoose.model('user', UserSchema);
