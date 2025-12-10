const cloudinary = require('../config/cloudinary');

// @desc    Upload image to Cloudinary
// @route   POST /api/admin/upload
// @access  Private/Admin
exports.uploadImage = async (req, res, next) => {
  try {
    if (!req.body.image) {
      return res.status(400).json({
        success: false,
        message: 'No image provided'
      });
    }

    // Upload image to Cloudinary
    const result = await cloudinary.uploader.upload(req.body.image, {
      folder: 'tuntun-bakers/products',
      transformation: [
        { width: 800, height: 800, crop: 'limit' },
        { quality: 'auto' },
        { fetch_format: 'auto' }
      ]
    });

    res.status(200).json({
      success: true,
      data: {
        url: result.secure_url,
        publicId: result.public_id
      }
    });
  } catch (error) {
    console.error('Image upload error:', error);
    next(error);
  }
};

// @desc    Delete image from Cloudinary
// @route   DELETE /api/admin/upload/:publicId
// @access  Private/Admin
exports.deleteImage = async (req, res, next) => {
  try {
    const publicId = req.params.publicId.replace(/_/g, '/');

    await cloudinary.uploader.destroy(publicId);

    res.status(200).json({
      success: true,
      message: 'Image deleted successfully'
    });
  } catch (error) {
    console.error('Image delete error:', error);
    next(error);
  }
};