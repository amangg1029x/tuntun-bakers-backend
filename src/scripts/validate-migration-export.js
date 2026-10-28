/**
 * Validate a local export before importing it into PostgreSQL.
 * Usage: node src/scripts/validate-migration-export.js <path-to-export.json>
 * This script is read-only and uses only Node.js built-ins.
 */
const fs = require('fs');
const path = require('path');

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function idOf(value) {
  if (value && typeof value === 'object' && value._id != null) return String(value._id);
  if (value == null) return null;
  return String(value);
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: node src/scripts/validate-migration-export.js <path-to-export.json>');
    process.exitCode = 2;
    return;
  }

  const file = path.resolve(input);
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (payload.formatVersion !== 1 || !payload.data || typeof payload.data !== 'object') {
    throw new Error('Unsupported export format; expected formatVersion 1 with a data object.');
  }

  const data = payload.data;
  const required = ['users', 'products', 'carts', 'favorites', 'orders'];
  for (const key of required) {
    if (!Array.isArray(data[key])) fail(`Missing or invalid collection: ${key}`);
  }
  if (process.exitCode) return;

  const ids = {};
  for (const key of required) {
    ids[key] = new Set();
    for (const row of data[key]) {
      if (!row || row._id == null) {
        fail(`${key} contains a document without _id`);
        continue;
      }
      const id = String(row._id);
      if (ids[key].has(id)) fail(`${key} contains duplicate _id ${id}`);
      ids[key].add(id);
    }
  }

  const emails = new Set();
  for (const user of data.users) {
    if (!user.email || typeof user.email !== 'string') fail(`User ${idOf(user)} has no valid email`);
    const email = String(user.email || '').trim().toLowerCase();
    if (email && emails.has(email)) fail(`Duplicate user email: ${email}`);
    if (email) emails.add(email);
  }

  for (const cart of data.carts) {
    if (!ids.users.has(idOf(cart.user))) fail(`Cart ${idOf(cart)} references missing user ${idOf(cart.user)}`);
    for (const item of cart.items || []) {
      const productId = idOf(item.product);
      if (productId && !ids.products.has(productId)) {
        fail(`Cart ${idOf(cart)} references missing product ${productId}`);
      }
    }
  }

  for (const favorite of data.favorites) {
    if (!ids.users.has(idOf(favorite.user))) fail(`Favorites ${idOf(favorite)} references missing user ${idOf(favorite.user)}`);
    for (const product of favorite.products || []) {
      const productId = idOf(product);
      if (productId && !ids.products.has(productId)) {
        fail(`Favorites ${idOf(favorite)} references missing product ${productId}`);
      }
    }
  }

  for (const order of data.orders) {
    if (!ids.users.has(idOf(order.user))) fail(`Order ${idOf(order)} references missing user ${idOf(order.user)}`);
    for (const item of order.items || []) {
      const productId = idOf(item.product);
      if (productId && !ids.products.has(productId)) {
        console.warn(`WARN: Order ${idOf(order)} references missing product ${productId}; preserve the order item snapshot.`);
      }
    }
  }

  const summary = Object.fromEntries(required.map(key => [key, data[key].length]));
  console.log('Export collection counts:', JSON.stringify(summary, null, 2));
  if (process.exitCode) {
    console.error('Validation failed. Resolve errors before importing.');
  } else {
    console.log('Validation passed: IDs and user/product references look consistent.');
    console.log('This is a structural preflight only; it does not prove SQL constraints or business rules.');
  }
}

try {
  main();
} catch (error) {
  console.error('Could not validate export:', error.message);
  process.exitCode = 1;
}
