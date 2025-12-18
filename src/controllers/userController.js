const User = require('../models/User');
const Order = require('../models/Order');

// @desc    Get user profile
// @route   GET /api/user/profile
// @access  Private
exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user stats (calculated dynamically from orders)
// @route   GET /api/user/stats
// @access  Private
exports.getUserStats = async (req, res, next) => {
  try {
    // Get all non-cancelled orders for the user
    const orders = await Order.find({ 
      user: req.user.id,
      status: { $ne: 'Cancelled' }
    });

    // Calculate stats
    const totalOrders = orders.length;
    const totalSpent = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
    const reviewsGiven = orders.filter(order => order.review && order.review.trim() !== '').length;

    res.status(200).json({
      success: true,
      data: {
        totalOrders,
        totalSpent,
        reviewsGiven
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user profile
// @route   PUT /api/user/profile
// @access  Private
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, email, phone } = req.body;

    const fieldsToUpdate = {};
    if (name) fieldsToUpdate.name = name;
    if (email) fieldsToUpdate.email = email;
    if (phone) fieldsToUpdate.phone = phone;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      fieldsToUpdate,
      {
        new: true,
        runValidators: true
      }
    );

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all addresses
// @route   GET /api/user/addresses
// @access  Private
exports.getAddresses = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    res.status(200).json({
      success: true,
      data: user.addresses
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add new address
// @route   POST /api/user/addresses
// @access  Private
exports.addAddress = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    // If this is set as default, unset others
    if (req.body.isDefault) {
      user.addresses.forEach(addr => {
        addr.isDefault = false;
      });
    }

    user.addresses.push(req.body);
    await user.save();

    res.status(201).json({
      success: true,
      data: user.addresses
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update address
// @route   PUT /api/user/addresses/:addressId
// @access  Private
exports.updateAddress = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    const address = user.addresses.id(req.params.addressId);

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // If setting as default, unset others
    if (req.body.isDefault) {
      user.addresses.forEach(addr => {
        addr.isDefault = false;
      });
    }

    // Update fields
    Object.keys(req.body).forEach(key => {
      address[key] = req.body[key];
    });

    await user.save();

    res.status(200).json({
      success: true,
      data: user.addresses
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete address
// @route   DELETE /api/user/addresses/:addressId
// @access  Private
exports.deleteAddress = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    user.addresses = user.addresses.filter(
      addr => addr._id.toString() !== req.params.addressId
    );

    await user.save();

    res.status(200).json({
      success: true,
      data: user.addresses
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get payment methods
// @route   GET /api/user/payment-methods
// @access  Private
exports.getPaymentMethods = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    res.status(200).json({
      success: true,
      data: user.savedPaymentMethods
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add payment method
// @route   POST /api/user/payment-methods
// @access  Private
exports.addPaymentMethod = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    // If setting as default, unset others
    if (req.body.isDefault) {
      user.savedPaymentMethods.forEach(method => {
        method.isDefault = false;
      });
    }

    user.savedPaymentMethods.push(req.body);
    await user.save();

    res.status(201).json({
      success: true,
      data: user.savedPaymentMethods
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete payment method
// @route   DELETE /api/user/payment-methods/:methodId
// @access  Private
exports.deletePaymentMethod = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    user.savedPaymentMethods = user.savedPaymentMethods.filter(
      method => method._id.toString() !== req.params.methodId
    );

    await user.save();

    res.status(200).json({
      success: true,
      data: user.savedPaymentMethods
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update preferences
// @route   PUT /api/user/preferences
// @access  Private
exports.updatePreferences = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    user.preferences = { ...user.preferences, ...req.body };
    await user.save();

    res.status(200).json({
      success: true,
      data: user.preferences
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Change password
// @route   PUT /api/user/change-password
// @access  Private
exports.changePassword = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('+password');

    // Check current password
    const isMatch = await user.comparePassword(req.body.currentPassword);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    user.password = req.body.newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    next(error);
  }
};