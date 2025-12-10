const express = require('express');
const router = express.Router();
const {
  createRazorpayOrder,
  verifyPayment,
  handlePaymentFailure,
  getPaymentDetails,
  refundPayment
} = require('../controllers/paymentController');
const { requireAuth, withAuth, clerkAuth, authorize } = require('../middleware/clerkAuth');

// IMPORTANT: Apply auth middleware to EACH route individually
// Do NOT use router.use() at the top!

// @desc    Create Razorpay order
// @route   POST /api/payment/create-order
// @access  Private
router.post('/create-order', requireAuth, withAuth, clerkAuth, createRazorpayOrder);

// @desc    Verify Razorpay payment signature
// @route   POST /api/payment/verify
// @access  Private
router.post('/verify', requireAuth, withAuth, clerkAuth, verifyPayment);

// @desc    Handle payment failure
// @route   POST /api/payment/failure
// @access  Private
router.post('/failure', requireAuth, withAuth, clerkAuth, handlePaymentFailure);

// @desc    Get payment details
// @route   GET /api/payment/:paymentId
// @access  Private
router.get('/:paymentId', requireAuth, withAuth, clerkAuth, getPaymentDetails);

// @desc    Refund payment
// @route   POST /api/payment/refund
// @access  Private/Admin
router.post('/refund', requireAuth, withAuth, clerkAuth, authorize('admin'), refundPayment);

// Log route registration
console.log('📝 Payment routes loaded:');
console.log('   POST /api/payment/create-order');
console.log('   POST /api/payment/verify');
console.log('   POST /api/payment/failure');
console.log('   GET  /api/payment/:paymentId');
console.log('   POST /api/payment/refund');

module.exports = router;