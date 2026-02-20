const path = require('path');
// Load .env from backend directory so FRONTEND_URL etc. are always read (even when run from project root)
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const connectDB = require('./src/config/db');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./src/config/swagger');
const { devLogger, requestLogger, errorLogger, captureResponseBody } = require('./src/middleware/logger');
const { LOCAL_DIR } = require('./src/config/storage');
const auth = require('./src/middleware/auth');
const currencySession = require('./src/middleware/currencySession');

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
require('./src/models/CurrencyExchangeRate');

// Ensure DB indexes are correct (partial unique, text, etc.)
const { ensureIndexes } = require('./src/config/ensureIndexes');
ensureIndexes().catch(() => {});

// Init Middleware
app.use(express.json({ extended: false }));
app.use(cors({ credentials: true, origin: true })); // allow credentials for session cookie

// Session: 24h TTL for currency (and future session data)
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
app.use(session({
  secret: process.env.SESSION_SECRET || process.env.JWT_SECRET || 'currency-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: SESSION_MAX_AGE_MS, httpOnly: true, sameSite: 'lax' },
  name: 'abscotek.sid'
}));

// Note: Webhook routes handle their own body parsing with signature verification
// See backend/src/routes/api/webhooks.js for details

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

// Single fallback: when /checkout/success hits the backend, redirect to frontend (avoid redirect loop if FRONTEND_URL points to backend)
app.get('/checkout/success', (req, res) => {
  const frontendUrl = (process.env.FRONTEND_URL || '').trim().replace(/\/$/, '');
  const currentOrigin = `${req.protocol}://${req.get('host')}`;
  if (!frontendUrl) {
    res.status(400).set('Content-Type', 'text/plain').send(
      'Set FRONTEND_URL in backend .env to your frontend origin (e.g. http://localhost:5173 for Vite).'
    );
    return;
  }
  if (frontendUrl === currentOrigin) {
    res.status(400).set('Content-Type', 'text/plain').send(
      'FRONTEND_URL must be your frontend app URL (e.g. http://localhost:5173), not the backend (e.g. 5832). Fix backend/.env and restart.'
    );
    return;
  }
  const qs = new URLSearchParams(req.query).toString();
  const url = qs ? `${frontendUrl}/checkout/success?${qs}` : `${frontendUrl}/checkout/success`;
  res.redirect(302, url);
});

// API: optional auth + currency session (X-User-Currency header, 24h cache)
app.use('/api', auth.optional);
app.use('/api', currencySession);

// Define Routes
app.use('/api/currency', require('./src/routes/api/currency'));
app.use('/api/users', require('./src/routes/api/users'));
app.use('/api/auth', require('./src/routes/api/auth'));
app.use('/api/admin', require('./src/routes/api/adminAuth'));
app.use('/api/admin/orders', require('./src/routes/api/adminOrders'));
app.use('/api/admin/users', require('./src/routes/api/adminUsers'));
app.use('/api/web3', require('./src/routes/api/web3Auth'));
app.use('/api/products', require('./src/routes/api/products'));
app.use('/api/admin/products', require('./src/routes/api/adminProducts'));
app.use('/api/orders', require('./src/routes/api/orders'));
app.use('/api/cart', require('./src/routes/api/cart'));
app.use('/api/wishlist', require('./src/routes/api/wishlist'));
app.use('/api/delivery-methods', require('./src/routes/api/delivery-methods'));
app.use('/api/delivery-addresses', require('./src/routes/api/delivery-addresses'));
app.use('/api/referrals', require('./src/routes/api/referrals'));
app.use('/api/webhooks', require('./src/routes/api/webhooks'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Error logging middleware (should be last)
app.use(errorLogger);

const PORT = process.env.PORT || 5832;

// Start payment verification job for crypto payments
const paymentVerificationJob = require('./src/jobs/paymentVerificationJob');
paymentVerificationJob.start();
console.log('✅ Payment verification job started');

// Start fund sweeper job to sweep funds from payment addresses to main wallet
const fundSweeperJob = require('./src/jobs/fundSweeperJob');
fundSweeperJob.start();
console.log('✅ Fund sweeper job started (runs every 2 minutes)');

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Logging: ${process.env.NODE_ENV === 'development' ? 'Detailed' : 'Standard'}`);
  console.log('✅ Server started successfully!');
});
