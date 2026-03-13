const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const {
  list,
  checkClaim,
  claim,
  startDeliveryPayment,
  startSeerbitDeliveryPayment,
} = require('../../controllers/giveawayController');

router.get('/', list);
router.get('/check-claim/:giveawayId/:productId', auth.optional, checkClaim);
router.post('/claim', auth, claim);
router.post('/start-delivery-payment', auth, startDeliveryPayment);
// Seerbit (NGN) delivery payment for giveaway claim – same as CheckoutPage flow
router.post('/start-seerbit-delivery-payment', auth, startSeerbitDeliveryPayment);
router.post('/seerbit-delivery-payment', auth, startSeerbitDeliveryPayment); // alias for compatibility

module.exports = router;
