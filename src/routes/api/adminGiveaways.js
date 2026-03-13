const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const {
  adminList,
  adminGet,
  adminCreate,
  adminUpdate,
  adminDelete,
} = require('../../controllers/giveawayController');

router.get('/', auth.admin, adminList);
router.get('/:id', auth.admin, adminGet);
router.post('/', auth.admin, adminCreate);
router.put('/:id', auth.admin, adminUpdate);
router.delete('/:id', auth.admin, adminDelete);

module.exports = router;
