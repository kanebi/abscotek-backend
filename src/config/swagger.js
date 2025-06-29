const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Absco Backend API',
      version: '1.0.0',
      description: 'API documentation for the Absco backend.',
    },
    servers: [
      {
        url: 'http://localhost:5832',
      },
    ],
    components: {
      schemas: {
        Product: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            price: { type: 'number' },
            image: { type: 'string' },
            seller: { type: 'string' },
            date: { type: 'string', format: 'date-time' },
          },
        },
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            product: { type: 'string' },
            buyer: { type: 'string' },
            orderStatus: { type: 'string', enum: ['Created', 'Paid', 'Shipped', 'Delivered', 'Cancelled'] },
            contractAddress: { type: 'string' },
            date: { type: 'string', format: 'date-time' },
          },
        },
        CartItem: {
          type: 'object',
          properties: {
            product: { type: 'string' },
            quantity: { type: 'number' },
          },
        },
        Cart: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            user: { type: 'string' },
            items: { type: 'array', items: { $ref: '#/components/schemas/CartItem' } },
            date: { type: 'string', format: 'date-time' },
          },
        },
        WishlistItem: {
          type: 'object',
          properties: {
            product: { type: 'string' },
          },
        },
        Wishlist: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            user: { type: 'string' },
            items: { type: 'array', items: { $ref: '#/components/schemas/WishlistItem' } },
            date: { type: 'string', format: 'date-time' },
          },
        },
        DeliveryMethod: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            price: { type: 'number' },
            estimatedDeliveryTime: { type: 'string' },
            date: { type: 'string', format: 'date-time' },
          },
        },
        Referral: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            referrer: { type: 'string' },
            referredUser: { type: 'string' },
            referralCode: { type: 'string' },
            date: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  },
  apis: ['./src/routes/api/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
