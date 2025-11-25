const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  }
});

const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  items: [cartItemSchema],
  totalAmount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Calculate total amount before saving
cartSchema.pre('save', async function(next) {
  if (this.items.length === 0) {
    this.totalAmount = 0;
    return next();
  }

  await this.populate('items.product');
  
  this.totalAmount = this.items.reduce((total, item) => {
    return total + (item.product.price * item.quantity);
  }, 0);
  
  next();
});

module.exports = mongoose.model('Cart', cartSchema);