const express = require('express');
const router = express.Router();
const {
  createOrder,
  getOrders,
  getOrder,
  cancelOrder,
  updateOrderStatus,
  addReview,
  getAllOrders
} = require('../controllers/orderController');
const { requireAuth, withAuth, clerkAuth } = require('../middleware/clerkAuth');
router.use(requireAuth, withAuth, clerkAuth);

router.post('/create', createOrder);
router.get('/', getOrders);
router.get('/:id', getOrder);
router.put('/:id/cancel', cancelOrder);
router.post('/:id/review', addReview);

// Admin only routes
router.get('/admin/all', getAllOrders);
router.put('/:id/status', updateOrderStatus);

module.exports = router;