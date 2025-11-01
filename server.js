require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/db');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./src/config/swagger');
const { devLogger, requestLogger, errorLogger, captureResponseBody } = require('./src/middleware/logger');
const path = require('path');
const { LOCAL_DIR } = require('./src/config/storage');

const app = express();

// Connect Database
connectDB();

// Load all models to ensure they're registered
require('./src/models/User');
require('./src/models/Product');
require('./src/models/Cart');
require('./src/models/Order');
require('./src/models/Payment');
require('./src/models/DeliveryAddress');
require('./src/models/DeliveryMethod');
require('./src/models/Wishlist');
require('./src/models/Referral');
require('./src/models/UserVerification');

// Ensure DB indexes are correct (partial unique, text, etc.)
const { ensureIndexes } = require('./src/config/ensureIndexes');
ensureIndexes().catch(() => {});

// Init Middleware
app.use(express.json({ extended: false }));
app.use(cors());

// Serve local uploads in non-production
if (process.env.NODE_ENV !== 'production') {
  app.use('/uploads', express.static(LOCAL_DIR));
}

// Development logging middleware
if (process.env.NODE_ENV === 'development') {
  console.log('🔧 Development mode - Detailed logging enabled');
  app.use(captureResponseBody);
  app.use(requestLogger);
  app.use(devLogger);
} else {
  console.log('🚀 Production mode - Standard logging enabled');
  app.use(devLogger); // Use detailed logging for now
}

// Define Routes
app.get('/', (req, res) => {
  console.log('🌐 API Root accessed');
  res.send('API Running');
});

// Define Routes
app.use('/api/users', require('./src/routes/api/users'));
app.use('/api/auth', require('./src/routes/api/auth'));
app.use('/api/admin', require('./src/routes/api/adminAuth'));
app.use('/api/admin', require('./src/routes/api/adminOrders'));
app.use('/api/web3', require('./src/routes/api/web3Auth'));
app.use('/api/products', require('./src/routes/api/products'));
app.use('/api/admin/products', require('./src/routes/api/adminProducts'));
app.use('/api/orders', require('./src/routes/api/orders'));
app.use('/api/cart', require('./src/routes/api/cart'));
app.use('/api/wishlist', require('./src/routes/api/wishlist'));
app.use('/api/delivery-methods', require('./src/routes/api/delivery-methods'));
app.use('/api/delivery-addresses', require('./src/routes/api/delivery-addresses'));
app.use('/api/referrals', require('./src/routes/api/referrals'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Error logging middleware (should be last)
app.use(errorLogger);

const PORT = process.env.PORT || 5832;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Logging: ${process.env.NODE_ENV === 'development' ? 'Detailed' : 'Standard'}`);
  console.log('✅ Server started successfully!');
});
