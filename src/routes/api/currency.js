const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const currencyController = require('../../controllers/currencyController');
const loadExchangeRates = require('../../middleware/loadExchangeRates');
const currencySession = require('../../middleware/currencySession');

// All routes use platform rates (getOrCreate, 24h refresh)
router.use(loadExchangeRates);

// GET /api/currency/rates - public; returns platform exchange rates for frontend
router.get('/rates', currencyController.getRates);

// Optional auth then session currency (so GET/PUT /me get user prefs when logged in)
router.use(auth.optional);
router.use(currencySession);

// GET /api/currency/me - user currency (session or auth); also sent in X-User-Currency
router.get('/me', currencyController.getMe);

// PUT /api/currency/me - set session currency (body: { currency }), 24h cache
router.put('/me', currencyController.setMe);

module.exports = router;
