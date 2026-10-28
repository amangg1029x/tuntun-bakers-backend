/**
 * Export MongoDB documents for a local, offline migration.
 *
 * Usage:
 *   CONFIRM_DATA_EXPORT=YES node src/scripts/export-mongo-data.js
 *
 * Writes a sensitive JSON file in the repository root. The output is ignored by
 * Git. Store it securely, never upload it, and delete it after migration.
 * This script does not write to PostgreSQL or change source data.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const User = require('../models/User');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const Favorite = require('../models/Favorite');
const Order = require('../models/Order');

const models = { users: User, products: Product, carts: Cart, favorites: Favorite, orders: Order };

async function main() {
  if (process.env.CONFIRM_DATA_EXPORT !== 'YES') {
    throw new Error('Refusing to export personal/customer data without CONFIRM_DATA_EXPORT=YES.');
  }
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required.');
  }

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });

  try {
    const data = {};
    const counts = {};
    for (const [name, Model] of Object.entries(models)) {
      // lean() preserves the MongoDB _id and avoids invoking document hooks.
      data[name] = await Model.find({}).lean({ getters: false, virtuals: false });
      counts[name] = data[name].length;
    }

    const output = path.resolve(process.cwd(), `tuntun-migration-export-${new Date().toISOString().replace(/[:.]/g, '-')}.migration-export.json`);
    fs.writeFileSync(output, JSON.stringify({
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      source: 'mongodb',
      counts,
      data
    }, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 });

    console.log('Export completed. Document counts:', counts);
    console.log('Sensitive export written to:', output);
    console.log('Verify the file is stored securely and do not commit or upload it.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async error => {
  console.error('MongoDB export failed:', error.message);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exitCode = 1;
});
