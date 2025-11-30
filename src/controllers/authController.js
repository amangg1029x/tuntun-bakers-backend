const User = require('../models/User');
const { clerkClient } = require('@clerk/clerk-sdk-node');

// @desc    Sync Clerk user with database (webhook handler)
// @route   POST /api/auth/webhook
// @access  Public (Clerk webhook)
exports.clerkWebhook = async (req, res) => {
  try {
    const { type, data } = req.body;

    switch (type) {
      case 'user.created':
        // Create user in database when created in Clerk
        await User.create({
          clerkId: data.id,
          name: `${data.first_name || ''} ${data.last_name || ''}`.trim() || 'User',
          email: data.email_addresses[0]?.email_address,
          phone: data.phone_numbers[0]?.phone_number || '',
          isEmailVerified: data.email_addresses[0]?.verification?.status === 'verified',
          isPhoneVerified: data.phone_numbers[0]?.verification?.status === 'verified'
        });
        break;

      case 'user.updated':
        // Update user in database when updated in Clerk
        await User.findOneAndUpdate(
          { clerkId: data.id },
          {
            name: `${data.first_name || ''} ${data.last_name || ''}`.trim() || 'User',
            email: data.email_addresses[0]?.email_address,
            phone: data.phone_numbers[0]?.phone_number || '',
            isEmailVerified: data.email_addresses[0]?.verification?.status === 'verified',
            isPhoneVerified: data.phone_numbers[0]?.verification?.status === 'verified'
          }
        );
        break;

      case 'user.deleted':
        // Soft delete or remove user from database
        await User.findOneAndDelete({ clerkId: data.id });
        break;
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Logout user (client-side Clerk signOut)
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
  try {
    // With Clerk, logout is handled client-side
    // This endpoint is for cleaning up any server-side session data
    res.status(200).json({
      success: true,
      message: 'Logged out successfully. Complete signout on client.'
    });
  } catch (error) {
    next(error);
  }
};

// Legacy endpoints below - keep for backward compatibility during migration

// @desc    Register user (Legacy - redirect to Clerk)
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  res.status(410).json({
    success: false,
    message: 'Registration is now handled by Clerk. Please use the sign-up page.',
    redirectTo: '/sign-up'
  });
};

// @desc    Login user (Legacy - redirect to Clerk)
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  res.status(410).json({
    success: false,
    message: 'Login is now handled by Clerk. Please use the sign-in page.',
    redirectTo: '/sign-in'
  });
};

// @desc    Forgot password (Redirect to Clerk)
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res, next) => {
  res.status(410).json({
    success: false,
    message: 'Password reset is now handled by Clerk.',
    redirectTo: '/forgot-password'
  });
};