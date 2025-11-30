const express = require('express');
const router = express.Router();
const {
  getProfile,
  updateProfile,
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  getPaymentMethods,
  addPaymentMethod,
  deletePaymentMethod,
  updatePreferences
} = require('../controllers/userController');
const { requireAuth, withAuth, clerkAuth } = require('../middleware/clerkAuth');

// All routes require Clerk authentication
router.use(requireAuth, withAuth, clerkAuth);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);

router.get('/addresses', getAddresses);
router.post('/addresses', addAddress);
router.put('/addresses/:addressId', updateAddress);
router.delete('/addresses/:addressId', deleteAddress);

router.get('/payment-methods', getPaymentMethods);
router.post('/payment-methods', addPaymentMethod);
router.delete('/payment-methods/:methodId', deletePaymentMethod);

router.put('/preferences', updatePreferences);

module.exports = router;