/**
 * Seeder: "Welcome Bundle" giveaway for new users
 * - 5 random products with price < 500 USDT
 * - 2 coupon codes per item, each 4 characters (alphanumeric)
 * Run: node scripts/seed-giveaway-newcomers.js
 * (from backend directory, or with NODE_PATH)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');

const Giveaway = require('../src/models/Giveaway');
const Product = require('../src/models/Product');

const GIVEAWAY_NAME = 'Welcome Bundle'; // marketing name for New Comers
const MAX_PRICE_USDT = 500;
const ITEMS_COUNT = 5;
const COUPONS_PER_ITEM = 2;
const COUPON_LENGTH = 4;
const EXPIRES_DAYS_FROM_NOW = 30;

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I to avoid confusion

function randomCoupon(length = COUPON_LENGTH) {
  let s = '';
  for (let i = 0; i < length; i++) {
    s += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return s;
}

function generateCoupons(count) {
  const set = new Set();
  while (set.size < count) {
    set.add(randomCoupon());
  }
  return [...set];
}

async function run() {
  await connectDB();

  const products = await Product.find({ price: { $lt: MAX_PRICE_USDT } })
    .limit(ITEMS_COUNT * 3) // fetch extra so we can randomize
    .lean();

  if (products.length < ITEMS_COUNT) {
    console.warn(
      `Only ${products.length} product(s) found with price < ${MAX_PRICE_USDT} USDT. Need at least ${ITEMS_COUNT}.`
    );
    if (products.length === 0) {
      console.error('No products to seed. Add products with price < 500 USDT first.');
      process.exit(1);
    }
  }

  // Shuffle and take ITEMS_COUNT
  const shuffled = products.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, ITEMS_COUNT);

  const items = selected.map((p) => ({
    product: p._id,
    name: p.name || '',
    couponCodes: generateCoupons(COUPONS_PER_ITEM),
    walletAddresses: [],
    paidDeliveryByUser: true,
    claimType: 'immediate',
  }));

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + EXPIRES_DAYS_FROM_NOW);

  const existing = await Giveaway.findOne({ name: GIVEAWAY_NAME });
  if (existing) {
    console.log(`Giveaway "${GIVEAWAY_NAME}" already exists (id: ${existing._id}). Skipping create.`);
    console.log('To replace it, delete the giveaway first from admin or DB.');
    process.exit(0);
  }

  const giveaway = new Giveaway({
    name: GIVEAWAY_NAME,
    items,
    expiresAt,
  });
  await giveaway.save();

  console.log(`Created giveaway: ${GIVEAWAY_NAME} (id: ${giveaway._id})`);
  console.log(`Expires: ${expiresAt.toISOString()}`);
  console.log(`Items: ${items.length}`);
  items.forEach((it, i) => {
    const p = selected[i];
    console.log(`  ${i + 1}. ${p.name} (${p.price} ${p.currency || 'USDC'}) — coupons: ${it.couponCodes.join(', ')}`);
  });

  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
