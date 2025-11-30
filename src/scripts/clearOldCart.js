// Add this script to src/scripts/clearOldCarts.js
// Run it once to clean up old test data

const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
};

const clearOldCarts = async () => {
  try {
    const Cart = require('../models/Cart');
    const User = require('../models/User');
    
    // Get all carts
    const carts = await Cart.find().populate('user');
    
    console.log(`Found ${carts.length} carts`);
    
    for (const cart of carts) {
      // Check if user exists with Clerk ID
      if (cart.user && !cart.user.clerkId) {
        console.log(`Clearing cart for legacy user: ${cart.user.email}`);
        cart.items = [];
        await cart.save();
      }
    }
    
    console.log('✅ Old carts cleared');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

connectDB().then(clearOldCarts);