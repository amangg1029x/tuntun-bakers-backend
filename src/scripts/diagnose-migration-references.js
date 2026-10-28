/**
 * Read-only diagnostic: checks whether IDs flagged by the export validator
 * exist in the source MongoDB collections. Prints IDs/counts only, no customer fields.
 * Usage: node src/scripts/diagnose-migration-references.js <export.json>
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');

function idOf(value) {
  if (value && typeof value === 'object' && value._id != null) return String(value._id);
  if (value == null) return null;
  return String(value);
}

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: node src/scripts/diagnose-migration-references.js <export.json>');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  const payload = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
  if (payload.formatVersion !== 1 || !payload.data) throw new Error('Unsupported migration export format.');
  const data = payload.data;

  const missingUsers = new Set();
  const missingProducts = new Set();
  for (const cart of data.carts || []) {
    const userId = idOf(cart.user);
    if (userId && !(data.users || []).some(row => idOf(row) === userId)) missingUsers.add(userId);
    for (const item of cart.items || []) {
      const productId = idOf(item.product);
      if (productId && !(data.products || []).some(row => idOf(row) === productId)) missingProducts.add(productId);
    }
  }
  for (const favorite of data.favorites || []) {
    const userId = idOf(favorite.user);
    if (userId && !(data.users || []).some(row => idOf(row) === userId)) missingUsers.add(userId);
    for (const product of favorite.products || []) {
      const productId = idOf(product);
      if (productId && !(data.products || []).some(row => idOf(row) === productId)) missingProducts.add(productId);
    }
  }
  for (const order of data.orders || []) {
    const userId = idOf(order.user);
    if (userId && !(data.users || []).some(row => idOf(row) === userId)) missingUsers.add(userId);
    for (const item of order.items || []) {
      const productId = idOf(item.product);
      if (productId && !(data.products || []).some(row => idOf(row) === productId)) missingProducts.add(productId);
    }
  }

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  try {
    const userIds = [...missingUsers].filter(mongoose.isValidObjectId);
    const productIds = [...missingProducts].filter(mongoose.isValidObjectId);
    const [foundUsers, foundProducts] = await Promise.all([
      User.find({ _id: { $in: userIds } }).select('_id').lean(),
      Product.find({ _id: { $in: productIds } }).select('_id').lean(),
    ]);
    const foundUserIds = new Set(foundUsers.map(row => String(row._id)));
    const foundProductIds = new Set(foundProducts.map(row => String(row._id)));
    console.log('Read-only reference diagnosis (IDs only):');
    console.log('Users referenced but absent from export:', missingUsers.size);
    console.log('  Found in source MongoDB:', foundUserIds.size);
    console.log('  Not found in source MongoDB:', [...missingUsers].filter(id => !foundUserIds.has(id)).length);
    console.log('Products referenced but absent from export:', missingProducts.size);
    console.log('  Found in source MongoDB:', foundProductIds.size);
    console.log('  Not found in source MongoDB:', [...missingProducts].filter(id => !foundProductIds.has(id)).length);
    console.log('No documents were inserted, updated, or deleted.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async error => {
  console.error('Reference diagnosis failed:', error.message);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exitCode = 1;
});
