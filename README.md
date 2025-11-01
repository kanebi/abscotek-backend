# Absco Backend - Cart, Orders, Delivery, Addresses

This document defines JSON Schemas for the domain models involved in cart, checkout, delivery addresses, and delivery methods.

## Conventions
- All `currency` fields should use ISO codes (e.g., "USDT", "USD", "NGN", "EUR").
- IDs may appear as `_id` (backend) or `id` (frontend). Where both are present, `_id` is the canonical backend identifier.
- Timestamps use ISO 8601 `date-time` strings.
- Money values are in minor or major units depending on backend; UI assumes major units and always displays using `AmountCurrency` with conversion based on user currency.

## Models

### User
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://abscotek.com/schemas/user.json",
  "title": "User",
  "type": "object",
  "properties": {
    "_id": { "type": "string" },
    "email": { "type": "string", "format": "email" },
    "firstName": { "type": "string" },
    "lastName": { "type": "string" },
    "walletAddress": { "type": "string", "pattern": "^0x[0-9a-fA-F]{40}$" },
    "areaNumber": { "type": "string", "description": "Phone country/area code, e.g. +234" },
    "phoneNumber": { "type": "string", "pattern": "^[0-9]{7,14}$" },
    "addresses": {
      "type": "array",
      "items": { "$ref": "https://abscotek.com/schemas/delivery-address.json" }
    },
    "preferences": {
      "type": "object",
      "properties": {
        "currency": { "type": "string", "enum": ["USDT", "USD", "NGN", "EUR"] }
      },
      "additionalProperties": false
    },
    "createdAt": { "type": "string", "format": "date-time" },
    "updatedAt": { "type": "string", "format": "date-time" }
  },
  "required": ["email"],
  "additionalProperties": true
}
```

### DeliveryAddress
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://abscotek.com/schemas/delivery-address.json",
  "title": "DeliveryAddress",
  "type": "object",
  "properties": {
    "_id": { "type": "string" },
    "id": { "type": "string", "description": "Frontend identifier (optional)" },
    "firstName": { "type": "string" },
    "lastName": { "type": "string" },
    "email": { "type": "string", "format": "email" },
    "areaNumber": { "type": "string", "default": "+234", "description": "E.g. +234" },
    "phoneNumber": { "type": "string", "pattern": "^[0-9]{7,14}$" },
    "streetAddress": { "type": "string" },
    "city": { "type": "string", "enum": ["lagos", "abuja", "port-harcourt", "kano"], "default": "lagos" },
    "state": { "type": "string", "enum": ["lagos", "fct", "rivers", "kano"], "default": "lagos" },
    "country": { "type": "string", "default": "NG" },
    "isDefault": { "type": "boolean", "default": false },
    "createdAt": { "type": "string", "format": "date-time" },
    "updatedAt": { "type": "string", "format": "date-time" }
  },
  "required": ["firstName", "lastName", "email", "areaNumber", "phoneNumber", "streetAddress", "city", "state"],
  "additionalProperties": false
}
```

### DeliveryMethod
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://abscotek.com/schemas/delivery-method.json",
  "title": "DeliveryMethod",
  "type": "object",
  "properties": {
    "_id": { "type": "string" },
    "name": { "type": "string" },
    "description": { "type": "string" },
    "price": { "type": "number", "minimum": 0 },
    "currency": { "type": "string", "enum": ["USDT", "USD", "NGN", "EUR"], "default": "USDT" },
    "estimatedDeliveryTime": { "type": "string", "examples": ["1-2 days", "3-5 business days"] },
    "targetRegion": { "type": "string", "enum": ["lagos", "other-state"], "description": "Optional segmentation used in UI" },
    "active": { "type": "boolean", "default": true },
    "sortOrder": { "type": "integer", "default": 0 },
    "createdAt": { "type": "string", "format": "date-time" },
    "updatedAt": { "type": "string", "format": "date-time" }
  },
  "required": ["name", "price"],
  "additionalProperties": false
}
```

### Cart
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://abscotek.com/schemas/cart.json",
  "title": "Cart",
  "type": "object",
  "properties": {
    "_id": { "type": "string" },
    "userId": { "type": "string" },
    "walletAddress": { "type": "string", "pattern": "^0x[0-9a-fA-F]{40}$" },
    "items": { "type": "array", "items": { "$ref": "https://abscotek.com/schemas/cart-item.json" } },
    "currency": { "type": "string", "enum": ["USDT", "USD", "NGN", "EUR"], "default": "USDT" },
    "subtotal": { "type": "number", "readOnly": true },
    "deliveryFee": { "type": "number", "readOnly": true, "default": 0 },
    "discount": { "type": "number", "readOnly": true, "default": 0 },
    "total": { "type": "number", "readOnly": true },
    "selectedAddressId": { "type": "string" },
    "selectedDeliveryMethodId": { "type": "string" },
    "createdAt": { "type": "string", "format": "date-time" },
    "updatedAt": { "type": "string", "format": "date-time" }
  },
  "required": ["items"],
  "additionalProperties": true
}
```

### Order
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://abscotek.com/schemas/order.json",
  "title": "Order",
  "type": "object",
  "properties": {
    "_id": { "type": "string" },
    "userId": { "type": "string" },
    "walletAddress": { "type": "string", "pattern": "^0x[0-9a-fA-F]{40}$" },
    "items": {
      "type": "array",
      "items": { "$ref": "https://abscotek.com/schemas/order-item.json" },
      "minItems": 1
    },
    "shippingAddress": { "$ref": "https://abscotek.com/schemas/delivery-address.json" },
    "deliveryMethod": { "$ref": "https://abscotek.com/schemas/delivery-method.json" },
    "subtotal": { "type": "number" },
    "deliveryFee": { "type": "number" },
    "discount": { "type": "number", "default": 0 },
    "totalAmount": { "type": "number" },
    "currency": { "type": "string", "enum": ["USDT", "USD", "NGN", "EUR"], "default": "USDT" },
    "status": { "type": "string", "enum": ["pending", "paid", "processing", "shipped", "delivered", "cancelled", "refunded"], "default": "pending" },
    "payment": { "$ref": "https://abscotek.com/schemas/payment.json" },
    "createdAt": { "type": "string", "format": "date-time" },
    "updatedAt": { "type": "string", "format": "date-time" }
  },
  "required": ["items", "subtotal", "totalAmount", "currency", "status"],
  "additionalProperties": true
}
```

### CreateOrderRequest
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://abscotek.com/schemas/create-order-request.json",
  "title": "CreateOrderRequest",
  "type": "object",
  "properties": {
    "products": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "properties": {
          "productId": { "type": "string" },
          "quantity": { "type": "integer", "minimum": 1 }
        },
        "required": ["productId", "quantity"],
        "additionalProperties": false
      }
    },
    "shippingAddressId": { "type": "string" },
    "shippingAddress": { "$ref": "https://abscotek.com/schemas/delivery-address.json" },
    "deliveryMethodId": { "type": "string" },
    "currency": { "type": "string", "enum": ["USDT", "USD", "NGN", "EUR"] },
    "totalAmount": { "type": "number", "description": "Client-calculated total, server should re-verify" },
    "walletAddress": { "type": "string", "pattern": "^0x[0-9a-fA-F]{40}$" },
    "notes": { "type": "string" }
  },
  "anyOf": [
    { "required": ["shippingAddressId"] },
    { "required": ["shippingAddress"] }
  ],
  "required": ["products"],
  "additionalProperties": false
}
```

## Examples

### DeliveryAddress example
```json
{
  "id": "addr_123",
  "firstName": "Ada",
  "lastName": "Lovelace",
  "email": "ada@example.com",
  "areaNumber": "+234",
  "phoneNumber": "8012345678",
  "streetAddress": "42 Alpha Street",
  "city": "lagos",
  "state": "lagos",
  "country": "NG",
  "isDefault": true
}
```

### DeliveryMethod example
```json
{
  "_id": "dm_lagos",
  "name": "Lagos: 1-2 days",
  "price": 5000,
  "currency": "NGN",
  "estimatedDeliveryTime": "1-2 days",
  "targetRegion": "lagos",
  "active": true
}
```

### Cart example
```json
{
  "_id": "cart_abc",
  "walletAddress": "0x0123456789abcdef0123456789abcdef01234567",
  "currency": "USDT",
  "items": [
    {
      "productId": "p_1",
      "product": { "_id": "p_1", "name": "Phone X", "price": 300, "currency": "USDT", "image": "/img/1.png" },
      "quantity": 2,
      "unitPrice": 300
    }
  ]
}
```

### Order example
```json
{
  "_id": "ord_123",
  "walletAddress": "0x0123456789abcdef0123456789abcdef01234567",
  "items": [
    { "productId": "p_1", "product": { "_id": "p_1", "name": "Phone X", "price": 300 }, "quantity": 2, "unitPrice": 300 }
  ],
  "shippingAddress": { "id": "addr_123", "firstName": "Ada", "lastName": "Lovelace", "email": "ada@example.com", "areaNumber": "+234", "phoneNumber": "8012345678", "streetAddress": "42 Alpha Street", "city": "lagos", "state": "lagos", "country": "NG" },
  "deliveryMethod": { "_id": "dm_lagos", "name": "Lagos: 1-2 days", "price": 5000, "currency": "NGN", "estimatedDeliveryTime": "1-2 days" },
  "subtotal": 600,
  "deliveryFee": 5000,
  "discount": 0,
  "totalAmount": 5600,
  "currency": "USDT",
  "status": "pending"
}
```

## Endpoints

### Cart
- GET `/api/cart` → Get current user's cart
  - Response:
  ```json
  {
    "_id": "cart_abc",
    "user": "user_123",
    "items": [
      {
        "productId": "p_1",
        "product": { "_id": "p_1", "name": "Phone X", "price": 300, "currency": "USDT" },
        "quantity": 2,
        "unitPrice": 300,
        "currency": "USDT"
      }
    ],
    "currency": "USDT",
    "subtotal": 600,
    "deliveryFee": 0,
    "discount": 0,
    "total": 600,
    "selectedAddress": "addr_123",
    "selectedDeliveryMethod": "dm_lagos",
    "createdAt": "2025-08-13T17:25:49+01:00",
    "updatedAt": "2025-08-13T17:25:49+01:00"
  }
  ```
- POST `/api/cart` → Add item to cart
  - Request:
  ```json
  {
    "productId": "p_1",
    "quantity": 1,
    "currency": "USDT"
  }
  ```
- PUT `/api/cart` → Update item quantity
  - Request:
  ```json
  {
    "productId": "p_1",
    "quantity": 3
  }
  ```
- DELETE `/api/cart/:userId/:productId` → Remove item (admin or owner)
- GET `/api/cart/:userId` → Get cart by user ID (admin or owner)
  - Response: Same as GET `/api/cart`

### Orders (User)
- POST `/api/orders` → Create order directly
  - Request:
  ```json
  {
    "products": [
      {
        "productId": "p_1",
        "quantity": 2
      }
    ],
    "shippingAddressId": "addr_123",
    "deliveryMethodId": "dm_lagos",
    "currency": "USDT",
    "notes": "Leave at reception"
  }
  ```
  - Response:
  ```json
  {
    "_id": "ord_123",
    "user": "user_123",
    "items": [
      {
        "productId": "p_1",
        "product": { "_id": "p_1", "name": "Phone X", "price": 300, "currency": "USDT" },
        "quantity": 2,
        "unitPrice": 300
      }
    ],
    "shippingAddress": {
      "_id": "addr_123",
      "firstName": "Ada",
      "lastName": "Lovelace",
      "email": "ada@example.com",
      "areaNumber": "+234",
      "phoneNumber": "8012345678",
      "streetAddress": "42 Alpha Street",
      "city": "lagos",
      "state": "lagos",
      "country": "NG"
    },
    "deliveryMethod": {
      "_id": "dm_lagos",
      "name": "Lagos: 1-2 days",
      "price": 5000,
      "currency": "NGN"
    },
    "subtotal": 600,
    "deliveryFee": 5000,
    "discount": 0,
    "totalAmount": 5600,
    "currency": "USDT",
    "status": "pending",
    "payment": {
      "transactionId": "tx_123",
      "method": "crypto",
      "provider": "usdt",
      "amount": 5600,
      "currency": "USDT",
      "status": "pending",
      "paidAt": null
    },
    "createdAt": "2025-08-13T17:25:49+01:00",
    "updatedAt": "2025-08-13T17:25:49+01:00"
  }
  ```
- POST `/api/orders/checkout` → Create order from cart and clear cart
  - Request:
  ```json
  {
    "deliveryMethodId": "dm_lagos",
    "shippingAddressId": "addr_123",
    "currency": "USDT",
    "notes": "Leave at reception"
  }
  ```
  - Response: Same as POST `/api/orders`
- GET `/api/orders` → List user's orders
  - Response:
  ```json
  [
    {
      "_id": "ord_123",
      "user": "user_123",
      "items": [...],
      "shippingAddress": {...},
      "deliveryMethod": {...},
      "subtotal": 600,
      "deliveryFee": 5000,
      "discount": 0,
      "totalAmount": 5600,
      "currency": "USDT",
      "status": "pending",
      "createdAt": "2025-08-13T17:25:49+01:00",
      "updatedAt": "2025-08-13T17:25:49+01:00"
    }
  ]
  ```
- GET `/api/orders/:id` → Get order by ID (owner or admin)
  - Response: Same as POST `/api/orders`
- PUT `/api/orders/:id/status` → Update order status (owner or admin)
  - Request:
  ```json
  {
    "status": "Shipped"
  }
  ```

### Delivery Methods
- GET `/api/delivery-methods` → List methods (auto-creates a default if none exist)
  - Response:
  ```json
  [
    {
      "_id": "dm_lagos",
      "name": "Lagos: 1-2 days",
      "price": 5000,
      "currency": "NGN",
      "estimatedDeliveryTime": "1-2 days",
      "targetRegion": "lagos",
      "active": true,
      "sortOrder": 0,
      "createdAt": "2025-08-13T17:25:49+01:00",
      "updatedAt": "2025-08-13T17:25:49+01:00"
    }
  ]
  ```
- POST `/api/delivery-methods` → Create (admin intended)
  - Request:
  ```json
  {
    "name": "Lagos: 1-2 days",
    "price": 5000,
    "currency": "NGN",
    "estimatedDeliveryTime": "1-2 days",
    "targetRegion": "lagos",
    "active": true,
    "sortOrder": 0
  }
  ```
- PUT `/api/delivery-methods/:id` → Update (admin intended)
  - Request:
  ```json
  {
    "name": "Lagos: 1-2 days",
    "price": 5000,
    "currency": "NGN",
    "estimatedDeliveryTime": "1-2 days",
    "targetRegion": "lagos",
    "active": true,
    "sortOrder": 0
  }
  ```
- DELETE `/api/delivery-methods/:id` → Delete (admin intended)

### User Addresses
- POST `/api/users/addresses` → Create an address
  - Request:
  ```json
  {
    "firstName": "Ada",
    "lastName": "Lovelace",
    "email": "ada@example.com",
    "areaNumber": "+234",
    "phoneNumber": "8012345678",
    "streetAddress": "42 Alpha Street",
    "city": "lagos",
    "state": "lagos",
    "country": "NG",
    "isDefault": true
  }
  ```
- GET `/api/users/addresses` → List addresses
  - Response:
  ```json
  [
    {
      "_id": "addr_123",
      "firstName": "Ada",
      "lastName": "Lovelace",
      "email": "ada@example.com",
      "areaNumber": "+234",
      "phoneNumber": "8012345678",
      "streetAddress": "42 Alpha Street",
      "city": "lagos",
      "state": "lagos",
      "country": "NG",
      "isDefault": true,
      "createdAt": "2025-08-13T17:25:49+01:00",
      "updatedAt": "2025-08-13T17:25:49+01:00"
    }
  ]
  ```
- PUT `/api/users/addresses/:addressId` → Update an address (set `isDefault: true` to make default)
  - Request:
  ```json
  {
    "firstName": "Ada",
    "lastName": "Lovelace",
    "email": "ada@example.com",
    "areaNumber": "+234",
    "phoneNumber": "8012345678",
    "streetAddress": "42 Alpha Street",
    "city": "lagos",
    "state": "lagos",
    "country": "NG",
    "isDefault": true
  }
  ```
- DELETE `/api/users/addresses/:addressId` → Remove an address

### Admin Orders
- GET `/api/admin/orders` → List all orders (admin)
  - Response: Same as GET `/api/orders`
- GET `/api/admin/orders/:id` → View order (admin)
  - Response: Same as GET `/api/orders/:id`
- PUT `/api/admin/orders/:id` → Update order (admin)
  - Request:
  ```json
  {
    "status": "Delivered",
    "trackingNumber": "TRACK123",
    "deliveryMethodId": "DELIVERY_METHOD_ID",
    "shippingAddressId": "ADDR_ID"
  }
  ```

## Swagger
- Docs served at `/api-docs`
- Component schemas added: `Address`, extended `Order`, `Cart`, `DeliveryMethod`
- Routes are annotated under `src/routes/api/*.js`

## Notes
- If `shippingAddress` is omitted during order creation or checkout, the user's default address (if any) is used.
- When `deliveryMethodId` is supplied, `deliveryFee` is applied and included in `totalAmount`.
- On first call to `GET /api/delivery-methods`, a default method is created if none exist.

## Run
- Install deps: `npm install`
- Start server: `npm start`
- Tests: `npm test`