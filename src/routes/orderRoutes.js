const express = require('express');
const router = express.Router();
const {
  createOrder,
  getOrders,
  getOrder,
  cancelOrder,
  addReview
} = require('../controllers/orderController');
const { requireAuth, withAuth, clerkAuth } = require('../middleware/clerkAuth');
router.use(requireAuth, withAuth, clerkAuth);

router.post('/create', createOrder);
router.get('/', getOrders);
router.get('/:id', getOrder);
router.put('/:id/cancel', cancelOrder);
router.post('/:id/review', addReview);

module.exports = router;