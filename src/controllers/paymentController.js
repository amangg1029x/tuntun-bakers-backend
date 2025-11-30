const Razorpay = require('razorpay');
const crypto = require('crypto');
const Order = require('../models/Order');

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// @desc    Create Razorpay order
// @route   POST /api/payment/create-order
// @access  Private
exports.createRazorpayOrder = async (req, res, next) => {
  try {
    const { amount, currency = 'INR', orderId } = req.body;

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    // Create Razorpay order
    const options = {
      amount: Math.round(amount * 100), // Razorpay expects amount in paise
      currency,
      receipt: orderId || `order_${Date.now()}`,
      notes: {
        userId: req.user.id,
        userEmail: req.user.email
      }
    };

    const razorpayOrder = await razorpay.orders.create(options);

    res.status(200).json({
      success: true,
      data: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        keyId: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    console.error('Razorpay order creation error:', error);
    next(error);
  }
};

// @desc    Verify Razorpay payment signature
// @route   POST /api/payment/verify
// @access  Private
exports.verifyPayment = async (req, res, next) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId
    } = req.body;

    const sign = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(sign.toString())
      .digest('hex');

    if (razorpay_signature === expectedSign) {
      // ✅ Payment is verified - Update order in database
      if (orderId) {
        const order = await Order.findById(orderId);

        if (order) {
          // Mark payment as paid
          order.paymentStatus = 'Paid';
          order.razorpayOrderId = razorpay_order_id;
          order.razorpayPaymentId = razorpay_payment_id;
          order.razorpaySignature = razorpay_signature;

          // If this was an online order that was still pending, confirm it now
          if (order.status === 'Pending') {
            order.status = 'Confirmed';

            const currentTime = new Date().toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit'
            });

            if (Array.isArray(order.timeline)) {
              const statusOrder = [
                'Order Placed',
                'Confirmed',
                'Preparing',
                'Out for Delivery',
                'Delivered'
              ];
              const currentIndex = statusOrder.indexOf('Confirmed');

              order.timeline = order.timeline.map((step) => {
                if (!step || !step.status) return step;

                const stepIndex = statusOrder.indexOf(step.status);

                // Set Confirmed step time + completed
                if (step.status === 'Confirmed') {
                  return {
                    ...step,
                    time: currentTime,
                    completed: true
                  };
                }

                // Mark all previous steps as completed
                if (stepIndex !== -1 && stepIndex <= currentIndex) {
                  return {
                    ...step,
                    completed: true
                  };
                }

                return step;
              });
            }
          }

          await order.save();
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Payment verified successfully',
        paymentId: razorpay_payment_id
      });
    } else {
      // Invalid signature
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }
  } catch (error) {
    console.error('Payment verification error:', error);
    next(error);
  }
};

// @desc    Handle payment failure
// @route   POST /api/payment/failure
// @access  Private
exports.handlePaymentFailure = async (req, res, next) => {
  try {
    const { orderId, error } = req.body;

    if (orderId) {
      const order = await Order.findById(orderId);
      
      if (order) {
        order.paymentStatus = 'Failed';
        order.paymentError = error?.description || 'Payment failed';
        await order.save();
      }
    }

    res.status(200).json({
      success: true,
      message: 'Payment failure recorded'
    });
  } catch (error) {
    console.error('Payment failure handler error:', error);
    next(error);
  }
};

// @desc    Get payment details
// @route   GET /api/payment/:paymentId
// @access  Private
exports.getPaymentDetails = async (req, res, next) => {
  try {
    const { paymentId } = req.params;

    const payment = await razorpay.payments.fetch(paymentId);

    res.status(200).json({
      success: true,
      data: payment
    });
  } catch (error) {
    console.error('Get payment details error:', error);
    next(error);
  }
};

// @desc    Refund payment
// @route   POST /api/payment/refund
// @access  Private/Admin
exports.refundPayment = async (req, res, next) => {
  try {
    const { paymentId, amount } = req.body;

    const refund = await razorpay.payments.refund(paymentId, {
      amount: amount ? Math.round(amount * 100) : undefined // Full refund if amount not specified
    });

    res.status(200).json({
      success: true,
      data: refund
    });
  } catch (error) {
    console.error('Refund error:', error);
    next(error);
  }
};