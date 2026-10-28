-- TunTun Bakers PostgreSQL foundation
-- IDs are TEXT to preserve existing MongoDB ObjectId strings during migration.
-- Apply to a NEW PostgreSQL database; this does not modify the MongoDB database.

BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  clerk_id TEXT UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  preferences JSONB NOT NULL DEFAULT '{"emailNotifications":true,"smsNotifications":true,"orderUpdates":true,"promotionalEmails":false}'::jsonb,
  stats JSONB NOT NULL DEFAULT '{"totalOrders":0,"totalSpent":0,"reviewsGiven":0}'::jsonb,
  reset_password_token TEXT,
  reset_password_expire TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS users_clerk_id_idx ON users(clerk_id);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);

CREATE TABLE IF NOT EXISTS user_addresses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  landmark TEXT,
  city TEXT NOT NULL,
  pincode TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_addresses_user_id_idx ON user_addresses(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS one_default_address_per_user ON user_addresses(user_id) WHERE is_default;

CREATE TABLE IF NOT EXISTS saved_payment_methods (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('upi', 'card', 'netbanking')),
  details TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS saved_payment_methods_user_id_idx ON saved_payment_methods(user_id);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  category TEXT NOT NULL CHECK (category IN ('Breads', 'Cakes', 'Pastries', 'Cookies', 'Specials')),
  emoji TEXT NOT NULL DEFAULT '🍞',
  image_url TEXT NOT NULL DEFAULT '',
  image_public_id TEXT NOT NULL DEFAULT '',
  rating NUMERIC(2,1) NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  reviews INTEGER NOT NULL DEFAULT 0 CHECK (reviews >= 0),
  tags TEXT[] NOT NULL DEFAULT '{}',
  prep_time TEXT NOT NULL DEFAULT 'Fresh daily',
  is_new BOOLEAN NOT NULL DEFAULT FALSE,
  is_trending BOOLEAN NOT NULL DEFAULT FALSE,
  in_stock BOOLEAN NOT NULL DEFAULT TRUE,
  stock_quantity INTEGER NOT NULL DEFAULT 100 CHECK (stock_quantity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS products_category_idx ON products(category);
CREATE INDEX IF NOT EXISTS products_created_at_idx ON products(created_at DESC);
CREATE INDEX IF NOT EXISTS products_search_idx ON products USING GIN (to_tsvector('english', name || ' ' || description));

CREATE TABLE IF NOT EXISTS carts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS cart_items (
  id TEXT PRIMARY KEY,
  cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  UNIQUE(cart_id, product_id)
);
CREATE INDEX IF NOT EXISTS cart_items_cart_id_idx ON cart_items(cart_id);

CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS favorite_items (
  favorite_id TEXT NOT NULL REFERENCES favorites(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (favorite_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  delivery_address JSONB NOT NULL DEFAULT '{}'::jsonb,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('upi', 'cod', 'card', 'netbanking', 'razorpay')),
  payment_status TEXT NOT NULL DEFAULT 'Pending' CHECK (payment_status IN ('Pending', 'Paid', 'Refunded', 'Failed')),
  razorpay_order_id TEXT UNIQUE,
  razorpay_payment_id TEXT UNIQUE,
  razorpay_signature TEXT,
  payment_error TEXT,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Confirmed', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled')),
  subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  delivery_charge NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (delivery_charge >= 0),
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  estimated_delivery TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  timeline JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  rating NUMERIC(2,1) CHECK (rating BETWEEN 0 AND 5),
  review TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS orders_user_created_idx ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);
CREATE INDEX IF NOT EXISTS orders_payment_status_idx ON orders(payment_status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL CHECK (quantity >= 1),
  emoji TEXT
);
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_product_id_idx ON order_items(product_id);

COMMIT;
