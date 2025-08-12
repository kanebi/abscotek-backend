# API Routes for AbscoBackend

This document outlines the available API routes, their methods, parameters, and expected responses.

## Admin Auth Routes (`/api/admin`)

| Method | Path | Summary | Parameters | Request Body | Responses |
|---|---|---|---|---|---|
| `POST` | `/api/admin/signup` | Register admin user | None | `name` (string, required), `email` (string, required), `password` (string, required), `companyName` (string, required), `phone` (string, required), `role` (string, optional) | `200`: Admin user created successfully (application/json)<br>`400`: Bad request<br>`500`: Server error |
| `POST` | `/api/admin/login` | Admin login | None | `email` (string, required), `password` (string, required) | `200`: Login successful (application/json)<br>`400`: Invalid credentials<br>`403`: Access denied<br>`500`: Server error |
| `GET` | `/api/admin/profile` | Get admin profile | None | None | `200`: Admin profile (application/json)<br>`401`: Unauthorized<br>`500`: Server error |
| `PUT` | `/api/admin/profile` | Update admin profile | None | `name` (string, optional), `email` (string, optional), `companyName` (string, optional), `phone` (string, optional) | `200`: Profile updated successfully (application/json)<br>`401`: Unauthorized<br>`404`: User not found<br>`500`: Server error |
| `PUT` | `/api/admin/change-password` | Change admin password | None | `currentPassword` (string, required), `newPassword` (string, required) | `200`: Password changed successfully<br>`400`: Invalid current password<br>`401`: Unauthorized<br>`500`: Server error |

## Auth Routes (`/api/auth`)

| Method | Path | Summary | Parameters | Request Body | Responses |
|---|---|---|---|---|---|
| `GET` | `/api/auth` | Get user by token | None | None | `200`: User object (application/json)<br>`401`: Unauthorized<br>`500`: Server error |
| `POST` | `/api/auth` | Authenticate user & get token | None | `email` (string, required), `password` (string, required) | `200`: JWT token and user info (application/json)<br>`400`: Invalid credentials or bad request<br>`500`: Server error |

## Web3 Auth Routes (`/api/web3`)

| Method | Path | Summary | Parameters | Request Body | Responses |
|---|---|---|---|---|---|
| `POST` | `/api/web3/request-signature` | Request signature for Web3 auth | None | `walletAddress` (string, required) | `200`: Nonce and message (application/json)<br>`400`: Bad request<br>`500`: Server error |
| `POST` | `/api/web3/verify-signature` | Verify signature and authenticate | None | `walletAddress` (string, required), `signature` (string, required) | `200`: JWT token and user info (application/json)<br>`400`: Invalid signature or expired nonce<br>`401`: Invalid signature<br>`500`: Server error |
| `GET` | `/api/web3/user` | Get current user info | None | None | `200`: User object (application/json)<br>`401`: Unauthorized<br>`500`: Server error |
| `POST` | `/api/web3/link-wallet` | Link wallet to existing user | None | `walletAddress` (string, required), `signature` (string, required) | `200`: Success message and user info (application/json)<br>`400`: Bad request or wallet already linked<br>`401`: Invalid signature<br>`500`: Server error |

## User Routes (`/api/users`)

| Method | Path | Summary | Parameters | Request Body | Responses |
|---|---|---|---|---|---|
| `POST` | `/api/users` | Register user | None | `name` (string, required), `email` (string, required), `password` (string, required), `referralCode` (string, optional) | `200`: JWT token and user info (application/json)<br>`400`: Bad request<br>`500`: Server error |
| `GET` | `/api/users/profile` | Get current user profile | None | None | `200`: User profile (application/json)<br>`401`: Unauthorized<br>`500`: Server error |
| `PUT` | `/api/users/profile` | Update user profile | None | `name` (string, optional), `email` (string, optional) | `200`: Updated user info (application/json)<br>`401`: Unauthorized<br>`404`: User not found<br>`500`: Server error |
| `GET` | `/api/users/verify/{userId}/{uniqueString}` | Verify user email | `userId` (path, string, required), `uniqueString` (path, string, required) | None | `200`: Email verified successfully!<br>`400`: Invalid verification link or link expired<br>`500`: Server error |

## Cart Routes (`/api/cart`)

| Method | Path | Summary | Parameters | Request Body | Responses |
|---|---|---|---|---|---|
| `GET` | `/api/cart` | Get user cart | None | None | `200`: User's cart (application/json)<br>`401`: Unauthorized<br>`500`: Server error |
| `GET` | `/api/cart/{userId}` | Get user cart by user ID | `userId` (path, string, required) | None | `200`: User's cart (application/json)<br>`401`: Unauthorized<br>`404`: User or cart not found<br>`500`: Server error |
| `POST` | `/api/cart` | Add item to cart | None | `productId` (string, required), `quantity` (number, optional) | `200`: Updated cart (application/json)<br>`400`: Bad request<br>`401`: Unauthorized<br>`404`: Product not found<br>`500`: Server error |
| `DELETE` | `/api/cart/{userId}/{productId}` | Remove item from cart | `userId` (path, string, required), `productId` (path, string, required) | None | `200`: Updated cart (application/json)<br>`401`: Unauthorized<br>`404`: Cart or product not found<br>`500`: Server error |

## Delivery Methods Routes (`/api/delivery-methods`)

| Method | Path | Summary | Parameters | Request Body | Responses |
|---|---|---|---|---|---|
| `POST` | `/api/delivery-methods` | Create a delivery method | None | `name` (string, required), `description` (string, optional), `price` (number, required), `estimatedDeliveryTime` (string, optional) | `200`: Created delivery method (application/json)<br>`400`: Bad request<br>`401`: Unauthorized<br>`500`: Server error |
| `GET` | `/api/delivery-methods` | Get all delivery methods | None | None | `200`: List of delivery methods (application/json)<br>`500`: Server error |
| `GET` | `/api/delivery-methods/{id}` | Get delivery method by ID | `id` (path, string, required) | None | `200`: Delivery method object (application/json)<br>`404`: Delivery method not found<br>`500`: Server error |
| `PUT` | `/api/delivery-methods/{id}` | Update a delivery method | `id` (path, string, required) | `name` (string, optional), `description` (string, optional), `price` (number, optional), `estimatedDeliveryTime` (string, optional) | `200`: Updated delivery method (application/json)<br>`400`: Bad request<br>`401`: Unauthorized<br>`404`: Delivery method not found<br>`500`: Server error |
| `DELETE` | `/api/delivery-methods/{id}` | Delete a delivery method | `id` (path, string, required) | None | `200`: Delivery method removed<br>`401`: Unauthorized<br>`404`: Delivery method not found<br>`500`: Server error |

## Order Routes (`/api/orders`)

| Method | Path | Summary | Parameters | Request Body | Responses |
|---|---|---|---|---|---|
| `POST` | `/api/orders` | Create an order | None | `products` (array, required) - array of `{productId, quantity}` | `200`: Created order (application/json)<br>`400`: Bad request<br>`401`: Unauthorized<br>`404`: Product not found<br>`500`: Server error |
| `GET` | `/api/orders` | Get all orders for a user | None | None | `200`: List of orders (application/json)<br>`401`: Unauthorized<br>`500`: Server error |
| `GET` | `/api/orders/{id}` | Get order by ID | `id` (path, string, required) | None | `200`: Order object (application/json)<br>`401`: Unauthorized<br>`403`: Access denied<br>`404`: Order not found<br>`500`: Server error |
| `PUT` | `/api/orders/{id}/status` | Update order status | `id` (path, string, required) | `status` (string, required) - one of: Created, Paid, Shipped, Delivered, Cancelled | `200`: Order status updated (application/json)<br>`400`: Bad request<br>`401`: Unauthorized<br>`403`: Access denied<br>`404`: Order not found<br>`500`: Server error |

## Product Routes (`/api/products`)

| Method | Path | Summary | Parameters | Request Body | Responses |
|---|---|---|---|---|---|
| `POST` | `/api/products` | Create a product | None | `name` (string, required), `description` (string, required), `price` (number, required), `image` (string, optional) | `200`: Created product (application/json)<br>`400`: Bad request<br>`401`: Unauthorized<br>`500`: Server error |
| `GET` | `/api/products` | Get all products | None | None | `200`: List of products (application/json)<br>`500`: Server error |
| `GET` | `/api/products/{id}` | Get product by ID | `id` (path, string, required) | None | `200`: Product object (application/json)<br>`404`: Product not found<br>`500`: Server error |
| `PUT` | `/api/products/{id}` | Update a product | `id` (path, string, required) | `name` (string, optional), `description` (string, optional), `price` (number, optional), `image` (string, optional) | `200`: Updated product (application/json)<br>`400`: Bad request<br>`401`: Unauthorized<br>`404`: Product not found<br>`500`: Server error |
| `DELETE` | `/api/products/{id}` | Delete a product | `id` (path, string, required) | None | `200`: Product removed<br>`401`: Unauthorized<br>`404`: Product not found<br>`500`: Server error |

## Referral Routes (`/api/referrals`)

| Method | Path | Summary | Parameters | Request Body | Responses |
|---|---|---|---|---|---|
| `POST` | `/api/referrals/generate` | Generate referral link | None | None | `200`: Generated referral code (application/json)<br>`401`: Unauthorized<br>`500`: Server error |
| `GET` | `/api/referrals/referred-users` | Get referred users | None | None | `200`: List of referred users (application/json)<br>`401`: Unauthorized<br>`500`: Server error |

## Wishlist Routes (`/api/wishlist`)

| Method | Path | Summary | Parameters | Request Body | Responses |
|---|---|---|---|---|---|
| `GET` | `/api/wishlist` | Get user wishlist | None | None | `200`: User's wishlist (application/json)<br>`401`: Unauthorized<br>`500`: Server error |
| `POST` | `/api/wishlist` | Add item to wishlist | None | `productId` (string, required) | `200`: Updated wishlist (application/json)<br>`400`: Bad request<br>`401`: Unauthorized<br>`404`: Product not found<br>`500`: Server error |
| `DELETE` | `/api/wishlist/{productId}` | Remove item from wishlist | `productId` (path, string, required) | None | `200`: Updated wishlist (application/json)<br>`401`: Unauthorized<br>`404`: Wishlist or product not found<br>`500`: Server error |

## Authentication Headers

The API supports multiple authentication methods:

### JWT Token (Primary)
```
Authorization: Bearer <jwt_token>
x-auth-token: <jwt_token>
```

### Header Fallback
```
x-wallet-address: <wallet_address>
x-user-email: <user_email>
x-user-id: <user_id>
```

## JWT Token Structure

JWT tokens contain comprehensive user information:
```json
{
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "User Name",
    "role": "user",
    "walletAddress": "0x...",
    "companyName": "Company Name",
    "phone": "Phone Number"
  }
}
```

## Error Responses

All endpoints return consistent error responses:
- `400`: Bad request with validation errors
- `401`: Unauthorized (authentication required)
- `403`: Forbidden (insufficient privileges)
- `404`: Resource not found
- `500`: Server error

## Development Logging

The API includes comprehensive development logging that shows:
- Request method, URL, and status
- Request/response headers (with sensitive data redacted)
- Request/response bodies
- Query parameters and route parameters
- Response time and size
- User information
- Error details with stack traces

Logs are color-coded for easy reading:
- 🔵 Blue: GET requests
- 🟢 Green: POST requests
- 🟡 Yellow: PUT requests
- 🔴 Red: DELETE requests and errors
- 🟣 Magenta: User information
