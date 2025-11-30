const express = require('express');
const router = express.Router();
const {
  clerkWebhook,
  getMe,
  logout
} = require('../controllers/authController');
const { requireAuth, withAuth, clerkAuth } = require('../middleware/clerkAuth');
router.use(requireAuth, withAuth, clerkAuth);

// Webhook endpoint (no auth required - Clerk will send events)
router.post('/webhook', clerkWebhook);

// Protected routes
router.get('/me', requireAuth, withAuth, clerkAuth, getMe);
router.post('/logout', logout);

module.exports = router;