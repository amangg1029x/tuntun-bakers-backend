const { clerkClient } = require('@clerk/express');
const User = require('../models/User');

exports.clerkAuth = async (req, res, next) => {
  try {
    console.log('🔍 clerkAuth middleware called');
    console.log('🔍 req.auth:', req.auth);
    
    const clerkUserId = req.auth?.userId;

    if (!clerkUserId) {
      console.log('❌ No Clerk user ID found in request');
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    console.log('✅ Clerk user ID:', clerkUserId);

    // Get full user details from Clerk first
    const clerkUser = await clerkClient.users.getUser(clerkUserId);

    // Use findOneAndUpdate with upsert to avoid race conditions
    const user = await User.findOneAndUpdate(
      { clerkId: clerkUserId }, // Find by clerkId
      {
        $setOnInsert: {
          clerkId: clerkUserId,
          email: clerkUser.emailAddresses[0]?.emailAddress,
          name: `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || 'User',
          phone: clerkUser.phoneNumbers[0]?.phoneNumber || '',
          isEmailVerified: clerkUser.emailAddresses[0]?.verification?.status === 'verified',
          isPhoneVerified: clerkUser.phoneNumbers[0]?.verification?.status === 'verified'
        }
      },
      {
        upsert: true, // Create if doesn't exist
        new: true,    // Return the updated document
        setDefaultsOnInsert: true
      }
    );

    console.log('✅ User found/created:', user.email);

    // Attach user to request
    req.user = {
      id: user._id,
      clerkId: user.clerkId,
      name: user.name,
      email: user.email,
      role: user.role
    };

    console.log('✅ User attached to request:', req.user.id);
    next();
  } catch (error) {
    console.error('❌ Clerk auth error:', error);
    return res.status(401).json({
      success: false,
      message: 'Authentication failed',
      error: error.message
    });
  }
};

// Middleware for optional authentication
exports.clerkAuthOptional = async (req, res, next) => {
  try {
    const clerkUserId = req.auth?.userId;

    if (clerkUserId) {
      let user = await User.findOne({ clerkId: clerkUserId });

      if (user) {
        req.user = {
          id: user._id,
          clerkId: user.clerkId,
          name: user.name,
          email: user.email,
          role: user.role
        };
      }
    }

    next();
  } catch (error) {
    console.error('Optional auth error:', error);
    next();
  }
};

// Grant access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user?.role || 'unknown'} is not authorized to access this route`
      });
    }
    next();
  };
};

// Use Clerk's built-in require auth
const { clerkMiddleware, requireAuth: clerkRequireAuth } = require('@clerk/express');

exports.requireAuth = clerkRequireAuth();
exports.withAuth = clerkMiddleware();