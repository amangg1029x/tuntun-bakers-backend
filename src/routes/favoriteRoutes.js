const express = require('express');
const router = express.Router();
const {
  getFavorites,
  addToFavorites,
  removeFromFavorites,
  toggleFavorite,
  clearFavorites
} = require('../controllers/favoriteController');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

router.get('/', getFavorites);
router.post('/add/:productId', addToFavorites);
router.delete('/remove/:productId', removeFromFavorites);
router.post('/toggle/:productId', toggleFavorite);
router.delete('/clear', clearFavorites);

module.exports = router;