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
      notes,
      // NEW: Payment details (only for razorpay)
      paymentStatus,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    } = req.body;

    // Validate items
    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No items in order'
      });
    }

    // Validate payment method
    const validPaymentMethods = ['cod', 'razorpay', 'upi', 'card', 'netbanking'];
    if (!validPaymentMethods.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment method'
      });
    }

    // ============================================
    // PAYMENT METHOD VALIDATION
    // ============================================
    
    // For Razorpay: Payment MUST be completed before order creation
    if (paymentMethod === 'razorpay') {
      // Check if payment details are provided
      if (!paymentStatus || paymentStatus !== 'Paid') {
        return res.status(400).json({
          success: false,
          message: 'Payment must be completed before creating order'
        });
      }

      // Verify payment details exist
      if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return res.status(400).json({
          success: false,
          message: 'Invalid payment details'
        });
      }

      // Optional: Re-verify payment signature for extra security
      const crypto = require('crypto');
      const sign = razorpayOrderId + '|' + razorpayPaymentId;
      const expectedSign = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(sign.toString())
        .digest('hex');

      if (razorpaySignature !== expectedSign) {
        return res.status(400).json({
          success: false,
          message: 'Payment verification failed. Invalid signature.'
        });
      }

      console.log('✅ Payment verified for Razorpay order');
    }

    // For COD: Payment status is Pending
    let orderPaymentStatus = 'Pending';
    if (paymentMethod === 'razorpay' && paymentStatus === 'Paid') {
      orderPaymentStatus = 'Paid';
    }

    // ============================================
    // STOCK VALIDATION & MANAGEMENT
    // ============================================
    
    // Check stock availability for all items
    const stockValidation = await Promise.all(
      items.map(async (item) => {
        const product = await Product.findById(item.product || item.id);
        if (!product) {
          throw new Error(`Product not found: ${item.product || item.id}`);
        }
        
        // Check if product is in stock
        if (!product.inStock) {
          return {
            valid: false,
            productName: product.name,
            message: `${product.name} is currently out of stock`
          };
        }
        
        // Check if sufficient quantity available
        if (product.stockQuantity < item.quantity) {
          return {
            valid: false,
            productName: product.name,
            message: `Only ${product.stockQuantity} units of ${product.name} available (requested: ${item.quantity})`
          };
        }
        
        return { valid: true, product, quantity: item.quantity };
      })
    );

    // Check if any items failed validation
    const invalidItems = stockValidation.filter(v => !v.valid);
    if (invalidItems.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Some items are not available',
        errors: invalidItems.map(item => item.message)
      });
    }

    // Deduct stock for all items
    await Promise.all(
      stockValidation.map(async ({ product, quantity }) => {
        product.stockQuantity -= quantity;
        
        // Mark as out of stock if quantity reaches 0
        if (product.stockQuantity <= 0) {
          product.inStock = false;
          product.stockQuantity = 0;
        }
        
        await product.save();
        console.log(`📦 Stock updated: ${product.name} - Remaining: ${product.stockQuantity}`);
      })
    );

    // Create order items with product details
    const orderItems = stockValidation.map(({ product, quantity }) => ({
      product: product._id,
      name: product.name,
      price: product.price,
      quantity: quantity,
      emoji: product.emoji
    }));

    // Calculate estimated delivery time
    const estimatedDelivery = new Date();
    estimatedDelivery.setMinutes(estimatedDelivery.getMinutes() + 45);

    // Create timeline based on payment status
    let initialStatus = 'Pending';
    let timeline = [
      { 
        status: 'Order Placed', 
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }), 
        completed: true 
      }
    ];

    // For paid orders (Razorpay): Auto-confirm
    if (orderPaymentStatus === 'Paid') {
      initialStatus = 'Confirmed';
      timeline.push({
        status: 'Confirmed',
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        completed: true
      });
    } else {
      timeline.push({
        status: 'Confirmed',
        time: 'Pending',
        completed: false
      });
    }

    // Add remaining timeline steps
    timeline.push(
      { status: 'Preparing', time: 'Pending', completed: false },
      { status: 'Out for Delivery', time: 'Pending', completed: false },
      { 
        status: 'Delivered', 
        time: `${estimatedDelivery.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} (Est.)`, 
        completed: false 
      }
    );

    // Create order object
    const orderObject = {
      user: req.user.id,
      items: orderItems,
      deliveryAddress,
      paymentMethod,
      paymentStatus: orderPaymentStatus,
      status: initialStatus,
      subtotal,
      deliveryCharge,
      totalAmount,
      estimatedDelivery,
      timeline,
      notes: notes || ''
    };

    // Add Razorpay details if payment method is razorpay
    if (paymentMethod === 'razorpay' && orderPaymentStatus === 'Paid') {
      orderObject.razorpayOrderId = razorpayOrderId;
      orderObject.razorpayPaymentId = razorpayPaymentId;
      orderObject.razorpaySignature = razorpaySignature;
    }

    // Create order
    const order = await Order.create(orderObject);

    // Clear user's cart
    await Cart.findOneAndUpdate(
      { user: req.user.id },
      { items: [], totalAmount: 0 }
    );

    // Populate order details
    await order.populate('items.product');

    // Log order creation
    console.log(`✅ Order created: ${order.orderNumber} | Payment: ${orderPaymentStatus} | Method: ${paymentMethod}`);

    res.status(201).json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('❌ Create order error:', error);
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
    const order = await Order.findById(req.params.id).populate('items.product');

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

    // ============================================
    // RESTORE STOCK ON CANCELLATION
    // ============================================
    
    // Restore stock for all items in the order
    await Promise.all(
      order.items.map(async (item) => {
        const product = await Product.findById(item.product);
        if (product) {
          product.stockQuantity += item.quantity;
          
          // Mark as in stock if it was out of stock
          if (!product.inStock && product.stockQuantity > 0) {
            product.inStock = true;
          }
          
          await product.save();
          console.log(`📦 Stock restored: ${product.name} - New quantity: ${product.stockQuantity}`);
        }
      })
    );

    order.status = 'Cancelled';
    order.cancelledAt = new Date();
    order.cancelReason = req.body.reason || 'Cancelled by user';

    if (order.paymentStatus === 'Paid') {
      order.paymentStatus = 'Refunded';
    }

    await order.save();

    res.status(200).json({
      success: true,
      message: 'Order cancelled and stock restored',
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