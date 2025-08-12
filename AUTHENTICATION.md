# Authentication System Documentation

## Overview

This backend implements a comprehensive authentication system that supports multiple authentication methods with fallback mechanisms. The system is designed to work seamlessly with both traditional email/password authentication and Web3 wallet-based authentication.

## Features

- **JWT-based authentication** with user info in tokens
- **Header-based fallback** for user identification
- **Wallet signature verification** for Web3 auth
- **Admin authentication** with email/password
- **Automatic user creation** for new wallet connections
- **Multiple user info extraction sources**

## JWT Token Structure

The JWT tokens contain comprehensive user information:

```json
{
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "User Name",
    "role": "user",
    "walletAddress": "0x..."
  }
}
```

## Authentication Methods

### 1. JWT Token (Primary Method)
- **Header**: `x-auth-token` or `Authorization: Bearer <token>`
- **Expiry**: 24 hours
- **Content**: Full user information

### 2. Header-Based Fallback
- **Wallet Address**: `x-wallet-address`
- **User Email**: `x-user-email`
- **User ID**: `x-user-id`

## API Endpoints

### Web3 Authentication

#### Request Signature
```http
POST /api/web3/request-signature
Content-Type: application/json

{
  "walletAddress": "0x..."
}
```

**Response:**
```json
{
  "nonce": "uuid",
  "message": "Please sign this message to authenticate: uuid",
  "walletAddress": "0x..."
}
```

#### Verify Signature
```http
POST /api/web3/verify-signature
Content-Type: application/json

{
  "walletAddress": "0x...",
  "signature": "0x..."
}
```

**Response:**
```json
{
  "token": "jwt_token",
  "user": {
    "id": "user_id",
    "walletAddress": "0x...",
    "role": "user",
    "name": "User Name",
    "email": "user@example.com"
  }
}
```

#### Get User Info
```http
GET /api/web3/user
Authorization: Bearer <token>
```

#### Link Wallet
```http
POST /api/web3/link-wallet
Authorization: Bearer <token>
Content-Type: application/json

{
  "walletAddress": "0x...",
  "signature": "0x..."
}
```

### Traditional Authentication

#### Login
```http
POST /api/auth
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password"
}
```

#### Register
```http
POST /api/users
Content-Type: application/json

{
  "name": "User Name",
  "email": "user@example.com",
  "password": "password"
}
```

## Authentication Middleware

### Standard Authentication
```javascript
const auth = require('../middleware/auth');

// Protected route
router.get('/protected', auth, (req, res) => {
  // req.user contains the authenticated user
});
```

### Admin Authentication
```javascript
const auth = require('../middleware/auth');

// Admin-only route
router.get('/admin', auth.admin, (req, res) => {
  // req.user contains the authenticated admin user
});
```

## User Info Extraction

The backend can retrieve user info from multiple sources in order of priority:

1. **JWT token** (primary method)
2. **Request headers** (fallback method)
3. **Database lookup** by wallet address or email

### Header Examples

```javascript
// JWT Token
headers: {
  'x-auth-token': 'jwt_token_here'
}

// Wallet Address Fallback
headers: {
  'x-wallet-address': '0x...'
}

// Email Fallback
headers: {
  'x-user-email': 'user@example.com'
}

// User ID Fallback
headers: {
  'x-user-id': 'user_id_here'
}
```

## Signature Verification

The system includes utility functions for signature verification:

```javascript
const { verifyAuthSignature, verifyLinkSignature } = require('../utils/signatureVerification');

// Verify authentication signature
const isValid = verifyAuthSignature(nonce, signature, walletAddress);

// Verify wallet linking signature
const isValid = verifyLinkSignature(walletAddress, signature);
```

## Environment Variables

Required environment variables:

```env
JWT_SECRET=your_jwt_secret_here
MONGODB_URI=your_mongodb_connection_string
PORT=5832
```

## Security Features

- **Nonce-based authentication** with 5-minute expiry
- **Cryptographic signature verification**
- **Role-based access control**
- **Automatic user creation** for new wallets
- **Secure password hashing** with bcrypt
- **JWT token expiry** (24 hours)

## Error Handling

The system provides comprehensive error handling:

- **401 Unauthorized**: No valid authentication found
- **403 Forbidden**: Insufficient privileges
- **400 Bad Request**: Invalid signature or expired nonce
- **500 Server Error**: Internal server errors

## Usage Examples

### Frontend Integration

```javascript
// Web3 Authentication
const response = await fetch('/api/web3/request-signature', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ walletAddress: '0x...' })
});

const { nonce, message } = await response.json();
const signature = await wallet.signMessage(message);

const authResponse = await fetch('/api/web3/verify-signature', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ walletAddress: '0x...', signature })
});

const { token, user } = await authResponse.json();

// Use token for subsequent requests
const userResponse = await fetch('/api/web3/user', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### Backend Integration

```javascript
// Protected route with user info
router.get('/profile', auth, (req, res) => {
  // req.user contains full user object
  res.json(req.user);
});

// Admin-only route
router.get('/admin/users', auth.admin, (req, res) => {
  // req.user contains admin user object
  res.json({ admin: req.user });
});
```

## Database Schema

The User model includes fields for the new authentication system:

```javascript
{
  name: String,
  email: String,
  password: String,
  walletAddress: String,
  role: String,
  jwtToken: String,
  tokenExpiry: Date,
  lastLogin: Date,
  isVerified: Boolean,
  balance: Number,
  referredBy: ObjectId,
  referralCode: String
}
```

This authentication system provides a robust, secure, and flexible foundation for both traditional and Web3-based applications. 