const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const { clerkMiddleware } = require('@clerk/express');

// Load environment variables
require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = ['MONGODB_URI', 'CLERK_SECRET_KEY', 'CLIENT_URL', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'];
requiredEnvVars.forEach(envVar => {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
});

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const favoriteRoutes = require('./routes/favoriteRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes'); // NEW: Admin routes

// Import error handler
const errorHandler = require('./middleware/errorHandler');

// Initialize Express app
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// CORS configuration
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));

// Clerk middleware - adds req.auth with session data
app.use(clerkMiddleware());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes); // NEW: Admin routes

// Log route registration for debugging
console.log('✅ Payment routes registered at /api/payment');
console.log('✅ Admin routes registered at /api/admin');

// Root API summary
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'TunTun Bakers API - Authentication powered by Clerk',
    version: '2.0.0',
    authentication: 'Clerk',
    payment: 'Razorpay',
    routes: {
      auth: '/api/auth',
      user: '/api/user',
      products: '/api/products',
      cart: '/api/cart',
      orders: '/api/orders',
      favorites: '/api/favorites',
      payment: '/api/payment',
      admin: '/api/admin' // NEW
    }
  });
});

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'TunTun Bakers API is running!',
    timestamp: new Date().toISOString(),
    authentication: 'Clerk',
    payment: 'Razorpay',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Error Handler (must be last)
app.use(errorHandler);

// Database connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
};

// Start server
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📋 Environment: ${process.env.NODE_ENV}`);
    console.log(`🔐 Authentication: Clerk`);
    console.log(`💳 Payment Gateway: Razorpay`);
    console.log(`\n📋 Available Routes:`);
    console.log(`   ✅ /api/auth`);
    console.log(`   ✅ /api/user`);
    console.log(`   ✅ /api/products`);
    console.log(`   ✅ /api/cart`);
    console.log(`   ✅ /api/orders`);
    console.log(`   ✅ /api/favorites`);
    console.log(`   ✅ /api/payment`);
    console.log(`   ✅ /api/admin (Protected)`);
    console.log(`\n🔍 Test health: http://localhost:${PORT}/api/health\n`);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.log('❌ Unhandled Rejection! Shutting down...');
  console.log(err.name, err.message);
  process.exit(1);
});