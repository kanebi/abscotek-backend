const DeliveryMethod = require('../models/DeliveryMethod');

// @desc    Create a delivery method
// @route   POST /api/delivery-methods
// @access  Private (admin)
const createDeliveryMethod = async (req, res) => {
  try {
    const { name, code, description, price, currency = 'NGN', estimatedDeliveryTime, isActive = true } = req.body;

    const newDeliveryMethod = new DeliveryMethod({
      name,
      code,
      description,
      price,
      currency,
      estimatedDeliveryTime,
      isActive
    });

    const deliveryMethod = await newDeliveryMethod.save();

    res.json(deliveryMethod);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Get all delivery methods (creates defaults if none exist)
// @route   GET /api/delivery-methods
// @access  Public
const getDeliveryMethods = async (req, res) => {
  try {
    let deliveryMethods = await DeliveryMethod.find();

    // Update existing delivery methods that don't have currency field
    const methodsToUpdate = deliveryMethods.filter(method => !method.currency);
    if (methodsToUpdate.length > 0) {
      console.log(`Updating ${methodsToUpdate.length} delivery methods to include currency field`);
      for (const method of methodsToUpdate) {
        await DeliveryMethod.findByIdAndUpdate(method._id, { currency: 'NGN' });
      }
      // Refetch the updated methods
      deliveryMethods = await DeliveryMethod.find();
    }

    // Create default delivery methods if none exist
    if (deliveryMethods.length === 0) {
      const defaultMethods = [
        {
          name: 'Standard Delivery',
          code: 'STD',
          description: 'Standard delivery within Nigeria',
          price: 2500,
          currency: 'NGN',
          estimatedDeliveryTime: '3-7 business days',
          isActive: true
        },
        {
          name: 'Express Delivery',
          code: 'EXP',
          description: 'Express delivery within Nigeria',
          price: 5000,
          currency: 'NGN',
          estimatedDeliveryTime: '1-2 business days',
          isActive: true
        },
        {
          name: 'International Shipping',
          code: 'INT',
          description: 'International shipping worldwide',
          price: 15000,
          currency: 'NGN',
          estimatedDeliveryTime: '7-14 business days',
          isActive: true
        }
      ];

      for (const methodData of defaultMethods) {
        const method = new DeliveryMethod(methodData);
        await method.save();
      }

      deliveryMethods = await DeliveryMethod.find();
    }

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
    const { name, code, description, price, currency, estimatedDeliveryTime, isActive } = req.body;

    let deliveryMethod = await DeliveryMethod.findById(req.params.id);

    if (!deliveryMethod) {
      return res.status(404).json({ msg: 'Delivery method not found' });
    }

    deliveryMethod = await DeliveryMethod.findByIdAndUpdate(
      req.params.id,
      { $set: { name, code, description, price, currency, estimatedDeliveryTime, isActive } },
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

// @desc    Sync frontend delivery methods with backend (get or create)
// @route   POST /api/delivery-methods/sync
// @access  Public
const syncDeliveryMethods = async (req, res) => {
  try {
    const { frontendMethods } = req.body;
    
    if (!frontendMethods || !Array.isArray(frontendMethods)) {
      return res.status(400).json({ msg: 'Frontend methods array is required' });
    }

    const syncedMethods = [];
    
    for (const frontendMethod of frontendMethods) {
      const { id, name, price, currency = 'NGN' } = frontendMethod;
      
      if (!id || !name || price === undefined) {
        console.warn('Skipping invalid frontend method:', frontendMethod);
        continue;
      }

      // Try to find existing method by code (using frontend id as code)
      let deliveryMethod = await DeliveryMethod.findOne({ code: id });
      
      if (!deliveryMethod) {
        // Create new delivery method
        const methodData = {
          name,
          code: id,
          description: `${name} delivery`,
          price,
          currency,
          estimatedDeliveryTime: name.includes('1-2') ? '1-2 business days' : '3-5 business days',
          isActive: true
        };
        
        deliveryMethod = new DeliveryMethod(methodData);
        await deliveryMethod.save();
        console.log(`Created new delivery method: ${name} (${id})`);
      } else {
        // Update existing method if needed
        const needsUpdate = 
          deliveryMethod.name !== name ||
          deliveryMethod.price !== price ||
          deliveryMethod.currency !== currency;
          
        if (needsUpdate) {
          deliveryMethod.name = name;
          deliveryMethod.price = price;
          deliveryMethod.currency = currency;
          await deliveryMethod.save();
          console.log(`Updated delivery method: ${name} (${id})`);
        }
      }
      
      // Add to synced methods with frontend mapping
      syncedMethods.push({
        _id: deliveryMethod._id,
        id: id, // Frontend ID for mapping
        name: deliveryMethod.name,
        code: deliveryMethod.code,
        price: deliveryMethod.price,
        currency: deliveryMethod.currency,
        description: deliveryMethod.description,
        estimatedDeliveryTime: deliveryMethod.estimatedDeliveryTime,
        isActive: deliveryMethod.isActive
      });
    }
    
    console.log(`Synced ${syncedMethods.length} delivery methods`);
    res.json(syncedMethods);
  } catch (err) {
    console.error('Error syncing delivery methods:', err.message);
    res.status(500).json({ msg: 'Server Error', error: err.message });
  }
};

module.exports = {
  createDeliveryMethod,
  getDeliveryMethods,
  getDeliveryMethodById,
  updateDeliveryMethod,
  deleteDeliveryMethod,
  syncDeliveryMethods,
};
