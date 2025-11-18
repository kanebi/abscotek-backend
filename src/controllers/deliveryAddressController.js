const DeliveryAddress = require('../models/DeliveryAddress');
const User = require('../models/User');

// @desc    Create a new delivery address
// @route   POST /api/delivery-addresses
// @access  Private
const createDeliveryAddress = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      areaNumber = '+234',
      phoneNumber,
      streetAddress,
      city,
      state,
      country = 'NG',
      isDefault = false
    } = req.body;

    // If this is set as default, unset all other default addresses for this user
    if (isDefault) {
      await DeliveryAddress.updateMany(
        { user: req.user.id },
        { isDefault: false }
      );
    }

    const deliveryAddress = new DeliveryAddress({
      user: req.user.id,
      firstName,
      lastName,
      email,
      areaNumber,
      phoneNumber,
      streetAddress,
      city,
      state,
      country,
      isDefault
    });

    await deliveryAddress.save();
    res.json(deliveryAddress);
  } catch (err) {
    console.error('Error creating delivery address:', err.message);
    res.status(500).json({ msg: 'Server Error', error: err.message });
  }
};

// @desc    Get all delivery addresses for a user
// @route   GET /api/delivery-addresses
// @access  Private
const getDeliveryAddresses = async (req, res) => {
  try {
    const addresses = await DeliveryAddress.find({ user: req.user.id })
      .sort({ isDefault: -1, createdAt: -1 }); // Default addresses first, then by creation date
    
    res.json(addresses);
  } catch (err) {
    console.error('Error fetching delivery addresses:', err.message);
    res.status(500).json({ msg: 'Server Error', error: err.message });
  }
};

// @desc    Get delivery address by ID
// @route   GET /api/delivery-addresses/:id
// @access  Private
const getDeliveryAddressById = async (req, res) => {
  try {
    const address = await DeliveryAddress.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!address) {
      return res.status(404).json({ msg: 'Delivery address not found' });
    }

    res.json(address);
  } catch (err) {
    console.error('Error fetching delivery address:', err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Delivery address not found' });
    }
    res.status(500).json({ msg: 'Server Error', error: err.message });
  }
};

// @desc    Update a delivery address
// @route   PUT /api/delivery-addresses/:id
// @access  Private
const updateDeliveryAddress = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      areaNumber,
      phoneNumber,
      streetAddress,
      city,
      state,
      country,
      isDefault
    } = req.body;

    let address = await DeliveryAddress.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!address) {
      return res.status(404).json({ msg: 'Delivery address not found' });
    }

    // If this is set as default, unset all other default addresses for this user
    if (isDefault) {
      await DeliveryAddress.updateMany(
        { user: req.user.id, _id: { $ne: req.params.id } },
        { isDefault: false }
      );
    }

    // Update the address
    address = await DeliveryAddress.findByIdAndUpdate(
      req.params.id,
      {
        firstName,
        lastName,
        email,
        areaNumber,
        phoneNumber,
        streetAddress,
        city,
        state,
        country,
        isDefault
      },
      { new: true }
    );

    res.json(address);
  } catch (err) {
    console.error('Error updating delivery address:', err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Delivery address not found' });
    }
    res.status(500).json({ msg: 'Server Error', error: err.message });
  }
};

// @desc    Delete a delivery address
// @route   DELETE /api/delivery-addresses/:id
// @access  Private
const deleteDeliveryAddress = async (req, res) => {
  try {
    const address = await DeliveryAddress.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!address) {
      return res.status(404).json({ msg: 'Delivery address not found' });
    }

    await DeliveryAddress.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Delivery address removed' });
  } catch (err) {
    console.error('Error deleting delivery address:', err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Delivery address not found' });
    }
    res.status(500).json({ msg: 'Server Error', error: err.message });
  }
};

// @desc    Set default delivery address
// @route   PUT /api/delivery-addresses/:id/default
// @access  Private
const setDefaultDeliveryAddress = async (req, res) => {
  try {
    const address = await DeliveryAddress.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!address) {
      return res.status(404).json({ msg: 'Delivery address not found' });
    }

    // Unset all other default addresses for this user
    await DeliveryAddress.updateMany(
      { user: req.user.id },
      { isDefault: false }
    );

    // Set this address as default
    address.isDefault = true;
    await address.save();

    res.json(address);
  } catch (err) {
    console.error('Error setting default delivery address:', err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Delivery address not found' });
    }
    res.status(500).json({ msg: 'Server Error', error: err.message });
  }
};

module.exports = {
  createDeliveryAddress,
  getDeliveryAddresses,
  getDeliveryAddressById,
  updateDeliveryAddress,
  deleteDeliveryAddress,
  setDefaultDeliveryAddress,
};
