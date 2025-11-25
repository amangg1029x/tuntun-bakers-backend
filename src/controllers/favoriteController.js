const Favorite = require('../models/Favorite');
const Product = require('../models/Product');

// @desc    Get user's favorites
// @route   GET /api/favorites
// @access  Private
exports.getFavorites = async (req, res, next) => {
  try {
    let favorites = await Favorite.findOne({ user: req.user.id })
      .populate('products');

    if (!favorites) {
      favorites = await Favorite.create({ user: req.user.id, products: [] });
    }

    res.status(200).json({
      success: true,
      count: favorites.products.length,
      data: favorites.products
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add product to favorites
// @route   POST /api/favorites/add/:productId
// @access  Private
exports.addToFavorites = async (req, res, next) => {
  try {
    const { productId } = req.params;

    // Check if product exists
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    let favorites = await Favorite.findOne({ user: req.user.id });

    if (!favorites) {
      favorites = await Favorite.create({
        user: req.user.id,
        products: [productId]
      });
    } else {
      // Check if already in favorites
      if (favorites.products.includes(productId)) {
        return res.status(400).json({
          success: false,
          message: 'Product already in favorites'
        });
      }

      favorites.products.push(productId);
      await favorites.save();
    }

    await favorites.populate('products');

    res.status(200).json({
      success: true,
      data: favorites.products
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Remove product from favorites
// @route   DELETE /api/favorites/remove/:productId
// @access  Private
exports.removeFromFavorites = async (req, res, next) => {
  try {
    const { productId } = req.params;

    const favorites = await Favorite.findOne({ user: req.user.id });

    if (!favorites) {
      return res.status(404).json({
        success: false,
        message: 'Favorites not found'
      });
    }

    favorites.products = favorites.products.filter(
      id => id.toString() !== productId
    );

    await favorites.save();
    await favorites.populate('products');

    res.status(200).json({
      success: true,
      data: favorites.products
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle favorite
// @route   POST /api/favorites/toggle/:productId
// @access  Private
exports.toggleFavorite = async (req, res, next) => {
  try {
    const { productId } = req.params;

    // Check if product exists
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    let favorites = await Favorite.findOne({ user: req.user.id });

    if (!favorites) {
      favorites = await Favorite.create({
        user: req.user.id,
        products: [productId]
      });
      await favorites.populate('products');
      
      return res.status(200).json({
        success: true,
        action: 'added',
        data: favorites.products
      });
    }

    const index = favorites.products.indexOf(productId);

    if (index > -1) {
      // Remove from favorites
      favorites.products.splice(index, 1);
      await favorites.save();
      await favorites.populate('products');

      return res.status(200).json({
        success: true,
        action: 'removed',
        data: favorites.products
      });
    } else {
      // Add to favorites
      favorites.products.push(productId);
      await favorites.save();
      await favorites.populate('products');

      return res.status(200).json({
        success: true,
        action: 'added',
        data: favorites.products
      });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Clear all favorites
// @route   DELETE /api/favorites/clear
// @access  Private
exports.clearFavorites = async (req, res, next) => {
  try {
    const favorites = await Favorite.findOne({ user: req.user.id });

    if (!favorites) {
      return res.status(404).json({
        success: false,
        message: 'Favorites not found'
      });
    }

    favorites.products = [];
    await favorites.save();

    res.status(200).json({
      success: true,
      message: 'Favorites cleared successfully',
      data: []
    });
  } catch (error) {
    next(error);
  }
};