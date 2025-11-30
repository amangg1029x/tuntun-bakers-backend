const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const verification = require('../controllers/paymentController')

// @desc    Create new order
// @route   POST /api/orders/create
// @access  Private
exports.createOrder = async (req, res, next) => {
  try {
    const {
      items,
      deliveryAddress,
      paymentMethod,
      subtotal,
      deliveryCharge,
      totalAmount,
      notes
    } = req.body;

    // Validate items
    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No items in order'
      });
    }

    // Create order items with product details
    const orderItems = await Promise.all(
      items.map(async (item) => {
        const product = await Product.findById(item.product || item.id);
        if (!product) {
          throw new Error(`Product not found: ${item.product || item.id}`);
        }
        return {
          product: product._id,
          name: product.name,
          price: product.price,
          quantity: item.quantity,
          emoji: product.emoji
        };
      })
    );

    // Calculate estimated delivery time
    const estimatedDelivery = new Date();
    estimatedDelivery.setMinutes(estimatedDelivery.getMinutes() + 45);

    // Create timeline
    const timeline = [
      { status: 'Order Placed', time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }), completed: true },
      { status: 'Confirmed', time: 'Pending', completed: false },
      { status: 'Preparing', time: 'Pending', completed: false },
      { status: 'Out for Delivery', time: 'Pending', completed: false },
      { status: 'Delivered', time: `${estimatedDelivery.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} (Est.)`, completed: false }
    ];

    // Create order
    const order = await Order.create({
      user: req.user.id,
      items: orderItems,
      deliveryAddress,
      paymentMethod,
      paymentStatus: 'Pending',
      subtotal,
      deliveryCharge,
      totalAmount,
      estimatedDelivery,
      timeline,
      notes
    });

    // Clear user's cart
    await Cart.findOneAndUpdate(
      { user: req.user.id },
      { items: [], totalAmount: 0 }
    );

    // Populate order details
    await order.populate('items.product');

    res.status(201).json({
      success: true,
      data: order
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all orders for user
// @route   GET /api/orders
// @access  Private
exports.getOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .populate('items.product')
      .sort('-createdAt');

    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private
exports.getOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('items.product')
      .populate('user', 'name email phone');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Make sure user owns this order
    if (order.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this order'
      });
    }

    res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Cancel order
// @route   PUT /api/orders/:id/cancel
// @access  Private
exports.cancelOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Make sure user owns this order
    if (order.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel this order'
      });
    }

    // Can only cancel if not already delivered or cancelled
    if (order.status === 'Delivered' || order.status === 'Cancelled') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel order with status: ${order.status}`
      });
    }

    order.status = 'Cancelled';
    order.cancelledAt = new Date();
    order.cancelReason = req.body.reason || 'Cancelled by user';

    if (order.paymentStatus === 'Paid') {
      order.paymentStatus = 'Refunded';
    }

    await order.save();

    res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update order status (Admin only)
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const validStatuses = ['Pending', 'Confirmed', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    order.status = status;

    // Update timeline
    const currentTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    
    order.timeline = order.timeline.map(step => {
      if (step.status === status) {
        return { ...step, time: currentTime, completed: true };
      }
      return step;
    });

    // Mark previous steps as completed
    const statusOrder = ['Order Placed', 'Confirmed', 'Preparing', 'Out for Delivery', 'Delivered'];
    const currentIndex = statusOrder.indexOf(status);
    
    order.timeline = order.timeline.map(step => {
      const stepIndex = statusOrder.indexOf(step.status);
      if (stepIndex <= currentIndex) {
        return { ...step, completed: true };
      }
      return step;
    });

    if (status === 'Delivered') {
      order.deliveredAt = new Date();
    }

    await order.save();

    res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add review to order
// @route   POST /api/orders/:id/review
// @access  Private
exports.addReview = async (req, res, next) => {
  try {
    const { rating, review } = req.body;

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Make sure user owns this order
    if (order.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to review this order'
      });
    }

    // Can only review delivered orders
    if (order.status !== 'Delivered') {
      return res.status(400).json({
        success: false,
        message: 'Can only review delivered orders'
      });
    }

    order.rating = rating;
    order.review = review;

    await order.save();

    res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all orders (Admin only)
// @route   GET /api/orders/admin/all
// @access  Private/Admin
exports.getAllOrders = async (req, res, next) => {
  try {
    const orders = await Order.find()
      .populate('user', 'name email phone')
      .populate('items.product')
      .sort('-createdAt');

    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (error) {
    next(error);
  }
};