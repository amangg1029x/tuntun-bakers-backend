const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const addressSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  landmark: String,
  city: { type: String, required: true },
  pincode: { type: String, required: true },
  isDefault: { type: Boolean, default: false }
});

const paymentMethodSchema = new mongoose.Schema({
  type: { type: String, enum: ['upi', 'card', 'netbanking'], required: true },
  details: { type: String, required: true },
  isDefault: { type: Boolean, default: false }
});

const userSchema = new mongoose.Schema({
  // Clerk ID (required for Clerk users)
  clerkId: {
    type: String,
    unique: true,
    sparse: true, // Allows null values for non-Clerk users
    index: true
  },
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
  },
  phone: {
    type: String,
    match: [/^[+]?[\d\s-()]+$/, 'Please provide a valid phone number']
  },
  // Password is now optional (only for legacy users)
  password: {
    type: String,
    minlength: 6,
    select: false
  },
  addresses: [addressSchema],
  savedPaymentMethods: [paymentMethodSchema],
  preferences: {
    emailNotifications: { type: Boolean, default: true },
    smsNotifications: { type: Boolean, default: true },
    orderUpdates: { type: Boolean, default: true },
    promotionalEmails: { type: Boolean, default: false }
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  isPhoneVerified: {
    type: Boolean,
    default: false
  },
  // Stats for user profile
  stats: {
    totalOrders: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    reviewsGiven: { type: Number, default: 0 }
  },
  // Legacy JWT fields (keep for backward compatibility)
  resetPasswordToken: String,
  resetPasswordExpire: Date
}, {
  timestamps: true
});

// Add index for email lookup
userSchema.index({ email: 1 });

// Hash password before saving (only if password exists and is modified)
userSchema.pre('save', async function(next) {
  // Skip hashing if password hasn't been modified or doesn't exist
  if (!this.isModified('password') || !this.password) {
    return next();
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password (for legacy users)
userSchema.methods.comparePassword = async function(enteredPassword) {
  if (!this.password) {
    return false;
  }
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);