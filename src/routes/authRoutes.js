const express = require('express');
const router = express.Router();
const {
  clerkWebhook,
  getMe,
  logout
} = require('../controllers/authController');
const { requireAuth, withAuth, clerkAuth } = require('../middleware/clerkAuth');

// Webhook endpoint (no auth required - Clerk will send events)
router.post('/webhook', clerkWebhook);

// Protected routes - apply middleware once
router.get('/me', requireAuth, withAuth, clerkAuth, getMe);
router.post('/logout', logout);

module.exports = router;