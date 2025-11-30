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

// All routes require Clerk authentication
router.use(requireAuth, withAuth, clerkAuth);

router.post('/create-order', createRazorpayOrder);
router.post('/verify', verifyPayment);
router.post('/failure', handlePaymentFailure);
router.get('/:paymentId', getPaymentDetails);

// Admin only
router.post('/refund', authorize('admin'), refundPayment);

module.exports = router;