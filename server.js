require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/db');
const logger = require('./src/config/logger');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./src/config/swagger');

const app = express();

// Connect Database
connectDB();

// Init Middleware
app.use(express.json({ extended: false }));
app.use(cors());

// Define Routes
app.get('/', (req, res) => {
  logger.info('API Root accessed');
  res.send('API Running');
});

// Define Routes
app.use('/api/users', require('./src/routes/api/users'));
app.use('/api/auth', require('./src/routes/api/auth'));
app.use('/api/admin/auth', require('./src/routes/api/adminAuth'));
app.use('/api/web3', require('./src/routes/api/web3'));
app.use('/api/products', require('./src/routes/api/products'));
app.use('/api/orders', require('./src/routes/api/orders'));
app.use('/api/cart', require('./src/routes/api/cart'));
app.use('/api/wishlist', require('./src/routes/api/wishlist'));
app.use('/api/delivery-methods', require('./src/routes/api/delivery-methods'));
app.use('/api/referrals', require('./src/routes/api/referrals'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const PORT = process.env.PORT || 5832;

app.listen(PORT, () => logger.info(`Server started on port ${PORT}`));
