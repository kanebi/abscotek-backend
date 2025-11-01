const mongoose = require('mongoose');

// Remove AddressSchema as we'll reference DeliveryAddress model

const UserSchema = new mongoose.Schema({
  firstName: {
    type: String,
  },
  lastName: {
    type: String,
  },
  name: {
    type: String,
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
  },
  walletAddress: {
    type: String,
    unique: true,
    sparse: true,
    match: /^0x[0-9a-fA-F]{40}$/
  },
  privyUserId: {
    type: String,
    unique: true,
    sparse: true
  },
  areaNumber: {
    type: String,
    default: '+234'
  },
  phoneNumber: {
    type: String,
    match: /^[0-9]{7,14}$/
  },
  phone: {
    type: String,
  },
  preferences: {
    currency: {
      type: String,
      enum: ['USDT', 'USD', 'NGN', 'EUR'],
      default: 'USDT'
    }
  },
  role: {
    type: String,
    enum: ['user', 'vendor', 'admin'],
    default: 'user'
  },
  companyName: {
    type: String
  },
  approved: {
    type: Boolean,
    default: false
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  balance: {
    type: Number,
    default: 0
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user'
  },
  referralCode: {
    type: String,
    unique: true,
    sparse: true
  },
  jwtToken: {
    type: String
  },
  tokenExpiry: {
    type: Date
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  linked: {
    type: Boolean,
    default: false
  },
  date: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true
});

// Add validation for required fields
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

// Add wallet address validation
UserSchema.path('walletAddress').validate(function (value) {
  if (value) {
    return /^0x[0-9a-fA-F]{40}$/.test(value);
  }
  return true;
}, 'Invalid wallet address format');

// Add phone number validation
UserSchema.path('phoneNumber').validate(function (value) {
  if (value) {
    return /^[0-9]{7,14}$/.test(value);
  }
  return true;
}, 'Invalid phone number format');

// Add currency preference validation
UserSchema.path('preferences.currency').validate(function (value) {
  if (this.role === 'user') {
    return value && value.length;
  }
  return true;
}, 'Currency preference is required for user role');

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
