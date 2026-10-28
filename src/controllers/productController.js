const pool = require('../config/postgres');

const CATEGORIES = ['Breads', 'Cakes', 'Pastries', 'Cookies', 'Specials'];
const SORT_FIELDS = new Set([
  'name', 'price', 'category', 'rating', 'reviews', 'createdAt',
  'updatedAt', 'isNew', 'isTrending', 'inStock', 'stockQuantity'
]);
const FIELD_MAP = {
  id: 'id', _id: 'id', name: 'name', description: 'description', price: 'price',
  category: 'category', emoji: 'emoji', 'image.url': 'image_url',
  'image.publicId': 'image_public_id', rating: 'rating', reviews: 'reviews',
  tags: 'tags', prepTime: 'prep_time', isNew: 'is_new', isTrending: 'is_trending',
  inStock: 'in_stock', stockQuantity: 'stock_quantity', createdAt: 'created_at',
  updatedAt: 'updated_at'
};

function toProduct(row) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    category: row.category,
    emoji: row.emoji,
    image: { url: row.image_url || '', publicId: row.image_public_id || '' },
    rating: Number(row.rating),
    reviews: row.reviews,
    tags: row.tags || [],
    prepTime: row.prep_time,
    isNew: row.is_new,
    isTrending: row.is_trending,
    inStock: row.in_stock,
    stockQuantity: row.stock_quantity,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseSort(sort) {
  if (!sort) return 'created_at DESC';
  const parts = String(sort).split(',').map(s => s.trim()).filter(Boolean);
  const clauses = [];
  for (let part of parts) {
    const desc = part.startsWith('-');
    const key = desc ? part.slice(1) : part;
    if (!SORT_FIELDS.has(key)) continue;
    clauses.push(`${FIELD_MAP[key]} ${desc ? 'DESC' : 'ASC'}`);
  }
  return clauses.length ? clauses.join(', ') : 'created_at DESC';
}

function buildFilters(query, startIndex = 1) {
  const clauses = [];
  const values = [];
  const add = (sql, value) => { values.push(value); clauses.push(sql.replace('?', `$${startIndex + values.length - 1}`)); };
  if (query.category && query.category !== 'All') {
    if (!CATEGORIES.includes(query.category)) {
      const error = new Error('Invalid product category');
      error.statusCode = 400;
      throw error;
    }
    add('category = ?', query.category);
  }
  for (const [key, column] of [['inStock','in_stock'],['isNew','is_new'],['isTrending','is_trending']]) {
    if (query[key] !== undefined) {
      if (!['true','false'].includes(String(query[key]))) {
        const error = new Error(`Invalid ${key} filter`);
        error.statusCode = 400;
        throw error;
      }
      add(`${column} = ?`, String(query[key]) === 'true');
    }
  }
  if (query.search) add("to_tsvector('english', name || ' ' || description) @@ plainto_tsquery('english', ?)", String(query.search).slice(0, 200));
  return { where: clauses.length ? 'WHERE ' + clauses.join(' AND ') : '', values };
}

function normalizeInput(body, partial = false) {
  const result = {};
  const fields = {
    name: 'name', description: 'description', price: 'price', category: 'category',
    emoji: 'emoji', rating: 'rating', reviews: 'reviews', tags: 'tags',
    prepTime: 'prep_time', isNew: 'is_new', isTrending: 'is_trending',
    inStock: 'in_stock', stockQuantity: 'stock_quantity'
  };
  for (const [input, column] of Object.entries(fields)) {
    if (body[input] !== undefined) result[column] = body[input];
  }
  if (body.image && typeof body.image === 'object') {
    if (body.image.url !== undefined) result.image_url = body.image.url;
    if (body.image.publicId !== undefined) result.image_public_id = body.image.publicId;
  }
  if (!partial) {
    for (const key of ['name','description','price','category']) {
      if (result[key] === undefined || result[key] === null || result[key] === '') {
        const error = new Error(`Please provide product ${key}`);
        error.statusCode = 400;
        throw error;
      }
    }
  }
  if (result.category !== undefined && !CATEGORIES.includes(result.category)) {
    const error = new Error('Invalid product category');
    error.statusCode = 400;
    throw error;
  }
  if (result.price !== undefined && (!Number.isFinite(Number(result.price)) || Number(result.price) < 0)) {
    const error = new Error('Product price must be a non-negative number');
    error.statusCode = 400;
    throw error;
  }
  if (result.rating !== undefined && (!Number.isFinite(Number(result.rating)) || Number(result.rating) < 0 || Number(result.rating) > 5)) {
    const error = new Error('Product rating must be between 0 and 5');
    error.statusCode = 400;
    throw error;
  }
  return result;
}

// @desc Get products with category/search/filter/sort/pagination
exports.getProducts = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const { where, values } = buildFilters(req.query);
    const [countResult, productResult] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM products ${where}`, values),
      pool.query(`SELECT * FROM products ${where} ORDER BY ${parseSort(req.query.sort)} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, limit, offset])
    ]);
    const total = countResult.rows[0].total;
    const pagination = {};
    if (offset + productResult.rows.length < total) pagination.next = { page: page + 1, limit };
    if (offset > 0) pagination.prev = { page: page - 1, limit };
    res.status(200).json({ success: true, count: productResult.rows.length, total, pagination, data: productResult.rows.map(toProduct) });
  } catch (error) { next(error); }
};

exports.getProduct = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Product not found' });
    res.status(200).json({ success: true, data: toProduct(result.rows[0]) });
  } catch (error) { next(error); }
};

exports.createProduct = async (req, res, next) => {
  try {
    const data = normalizeInput(req.body || {});
    const keys = Object.keys(data);
    const columns = keys.join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const values = keys.map(k => data[k]);
    const result = await pool.query(`INSERT INTO products (${columns}) VALUES (${placeholders}) RETURNING *`, values);
    res.status(201).json({ success: true, data: toProduct(result.rows[0]) });
  } catch (error) { next(error); }
};

exports.updateProduct = async (req, res, next) => {
  try {
    const data = normalizeInput(req.body || {}, true);
    const keys = Object.keys(data);
    if (!keys.length) return res.status(400).json({ success: false, message: 'No valid product fields provided' });
    const assignments = keys.map((key, i) => `${key} = $${i + 1}`);
    assignments.push('updated_at = NOW()');
    const result = await pool.query(`UPDATE products SET ${assignments.join(', ')} WHERE id = $${keys.length + 1} RETURNING *`, [...keys.map(k => data[k]), req.params.id]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Product not found' });
    res.status(200).json({ success: true, data: toProduct(result.rows[0]) });
  } catch (error) { next(error); }
};

exports.deleteProduct = async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Product not found' });
    res.status(200).json({ success: true, message: 'Product deleted successfully' });
  } catch (error) { next(error); }
};

exports.searchProducts = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ success: false, message: 'Please provide search query' });
    const result = await pool.query(
      "SELECT * FROM products WHERE to_tsvector('english', name || ' ' || description) @@ plainto_tsquery('english', $1) ORDER BY created_at DESC LIMIT 10",
      [q.slice(0, 200)]
    );
    res.status(200).json({ success: true, count: result.rows.length, data: result.rows.map(toProduct) });
  } catch (error) { next(error); }
};
