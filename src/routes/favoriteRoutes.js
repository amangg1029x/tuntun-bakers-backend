const express = require('express');
const router = express.Router();
const {
  getFavorites,
  addToFavorites,
  removeFromFavorites,
  toggleFavorite,
  clearFavorites
} = require('../controllers/favoriteController');
const { requireAuth, withAuth, clerkAuth } = require('../middleware/clerkAuth');

// All routes require Clerk authentication
router.use(requireAuth, withAuth, clerkAuth);

router.get('/', getFavorites);
router.post('/add/:productId', addToFavorites);
router.delete('/remove/:productId', removeFromFavorites);
router.post('/toggle/:productId', toggleFavorite);
router.delete('/clear', clearFavorites);

module.exports = router;