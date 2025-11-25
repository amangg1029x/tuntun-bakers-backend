const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  name: String,
  price: Number,
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  emoji: String
});

function generateOrderNumber() {
  const ts = Date.now(); // or use formatted date
  const rnd = Math.floor(Math.random() * 9000) + 1000;
  return `TN-${ts}-${rnd}`;
}

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: false,
    unique: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [orderItemSchema],
  deliveryAddress: {
    name: String,
    phone: String,
    address: String,
    landmark: String,
    city: String,
    pincode: String
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ['upi', 'cod', 'card', 'netbanking']
  },
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Paid', 'Refunded', 'Failed'],
    default: 'Pending'
  },
  status: {
    type: String,
    enum: ['Pending', 'Confirmed', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'],
    default: 'Pending'
  },
  subtotal: {
    type: Number,
    required: true
  },
  deliveryCharge: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    required: true
  },
  estimatedDelivery: Date,
  deliveredAt: Date,
  cancelledAt: Date,
  cancelReason: String,
  timeline: [{
    status: String,
    time: String,
    completed: Boolean
  }],
  notes: String,
  rating: {
    type: Number,
    min: 0,
    max: 5
  },
  review: String
}, {
  timestamps: true
});

// Generate order number
orderSchema.pre('save', async function(next) {
  if (!this.orderNumber) {
    const timestamp = Date.now();
    this.orderNumber = `TB-${timestamp}`;
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);