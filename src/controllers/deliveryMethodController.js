const DeliveryMethod = require('../models/DeliveryMethod');

// @desc    Create a delivery method
// @route   POST /api/delivery-methods
// @access  Private (admin)
const createDeliveryMethod = async (req, res) => {
  try {
    const { name, description, price, estimatedDeliveryTime } = req.body;

    const newDeliveryMethod = new DeliveryMethod({
      name,
      description,
      price,
      estimatedDeliveryTime,
    });

    const deliveryMethod = await newDeliveryMethod.save();

    res.json(deliveryMethod);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Get all delivery methods
// @route   GET /api/delivery-methods
// @access  Public
const getDeliveryMethods = async (req, res) => {
  try {
    const deliveryMethods = await DeliveryMethod.find();
    res.json(deliveryMethods);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Get delivery method by ID
// @route   GET /api/delivery-methods/:id
// @access  Public
const getDeliveryMethodById = async (req, res) => {
  try {
    const deliveryMethod = await DeliveryMethod.findById(req.params.id);

    if (!deliveryMethod) {
      return res.status(404).json({ msg: 'Delivery method not found' });
    }

    res.json(deliveryMethod);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Delivery method not found' });
    }
    res.status(500).send('Server Error');
  }
};

// @desc    Update a delivery method
// @route   PUT /api/delivery-methods/:id
// @access  Private (admin)
const updateDeliveryMethod = async (req, res) => {
  try {
    const { name, description, price, estimatedDeliveryTime } = req.body;

    let deliveryMethod = await DeliveryMethod.findById(req.params.id);

    if (!deliveryMethod) {
      return res.status(404).json({ msg: 'Delivery method not found' });
    }

    deliveryMethod = await DeliveryMethod.findByIdAndUpdate(
      req.params.id,
      { $set: { name, description, price, estimatedDeliveryTime } },
      { new: true }
    );

    res.json(deliveryMethod);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Delete a delivery method
// @route   DELETE /api/delivery-methods/:id
// @access  Private (admin)
const deleteDeliveryMethod = async (req, res) => {
  try {
    const deliveryMethod = await DeliveryMethod.findById(req.params.id);

    if (!deliveryMethod) {
      return res.status(404).json({ msg: 'Delivery method not found' });
    }

    await deliveryMethod.remove();

    res.json({ msg: 'Delivery method removed' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Delivery method not found' });
    }
    res.status(500).send('Server Error');
  }
};

module.exports = {
  createDeliveryMethod,
  getDeliveryMethods,
  getDeliveryMethodById,
  updateDeliveryMethod,
  deleteDeliveryMethod,
};
