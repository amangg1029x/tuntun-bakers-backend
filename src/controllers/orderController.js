const pool = require('../config/postgres');
const crypto = require('crypto');

async function getOrderWithItems(db, id) {
  const order = await db.query('SELECT * FROM orders WHERE id=$1', [id]);
  if (!order.rowCount) return null;
  const items = await db.query('SELECT * FROM order_items WHERE order_id=$1 ORDER BY id', [id]);
  return { ...order.rows[0], _id: id, items: items.rows };
}

exports.getOrders = async (req, res, next) => {
  try {
    const r = await pool.query('SELECT id FROM orders WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id]);
    res.json({ success: true, count: r.rowCount, data: await Promise.all(r.rows.map(x => getOrderWithItems(pool, x.id))) });
  } catch (e) { next(e); }
};

exports.getOrder = async (req, res, next) => {
  try {
    const r = await pool.query('SELECT id,user_id FROM orders WHERE id=$1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ success: false, message: 'Order not found' });
    if (r.rows[0].user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Not authorized' });
    res.json({ success: true, data: await getOrderWithItems(pool, req.params.id) });
  } catch (e) { next(e); }
};

exports.createOrder = async (req, res, next) => {
  const db = await pool.connect();
  try {
    const b = req.body || {};
    if (!Array.isArray(b.items) || !b.items.length) return res.status(400).json({ success: false, message: 'No items in order' });
    if (!['cod', 'razorpay', 'upi', 'card', 'netbanking'].includes(b.paymentMethod)) return res.status(400).json({ success: false, message: 'Invalid payment method' });
    const quantities = new Map();
    for (const item of b.items) {
      const productId = String(item.product || item.productId || item.id || item._id || '');
      const quantity = Number(item.quantity);
      if (!productId || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
        return res.status(400).json({ success: false, message: 'Each item needs a product ID and a quantity from 1 to 100' });
      }
      quantities.set(productId, (quantities.get(productId) || 0) + quantity);
    }
    if ([...quantities.values()].some(q => q > 100)) return res.status(400).json({ success: false, message: 'Maximum quantity per product is 100' });

    let paymentStatus = 'Pending';
    if (b.paymentMethod === 'razorpay') {
      const key = process.env.RAZORPAY_KEY_SECRET;
      if (!key || b.paymentStatus !== 'Paid' || !b.razorpayOrderId || !b.razorpayPaymentId || !b.razorpaySignature) {
        return res.status(400).json({ success: false, message: 'Payment verification failed' });
      }
      const expected = crypto.createHmac('sha256', key).update(b.razorpayOrderId + '|' + b.razorpayPaymentId).digest();
      const supplied = Buffer.from(String(b.razorpaySignature));
      if (supplied.length !== expected.toString('hex').length || !crypto.timingSafeEqual(Buffer.from(expected.toString('hex')), supplied)) {
        return res.status(400).json({ success: false, message: 'Payment verification failed' });
      }
      paymentStatus = 'Paid';
    }

    await db.query('BEGIN');
    const productIds = [...quantities.keys()].sort();
    const productsResult = await db.query(
      'SELECT id,name,price,emoji,in_stock,stock_quantity FROM products WHERE id = ANY($1::text[]) ORDER BY id FOR UPDATE',
      [productIds]
    );
    if (productsResult.rowCount !== productIds.length) {
      await db.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'One or more products were not found' });
    }
    const products = new Map(productsResult.rows.map(p => [p.id, p]));
    let subtotal = 0;
    for (const [id, quantity] of quantities) {
      const product = products.get(id);
      if (!product.in_stock || product.stock_quantity < quantity) {
        await db.query('ROLLBACK');
        return res.status(409).json({ success: false, message: 'Insufficient stock for ' + product.name });
      }
      subtotal += Number(product.price) * quantity;
    }
    subtotal = Math.round((subtotal + Number.EPSILON) * 100) / 100;
    const deliveryCharge = Number(b.deliveryCharge);
    const safeDeliveryCharge = Number.isFinite(deliveryCharge) && deliveryCharge >= 0 && deliveryCharge <= 1000 ? deliveryCharge : 0;
    const totalAmount = Math.round((subtotal + safeDeliveryCharge + Number.EPSILON) * 100) / 100;
    const id = crypto.randomUUID();
    const orderNumber = 'TB-' + Date.now().toString().slice(-8);

    await db.query(
      'INSERT INTO orders(id,order_number,user_id,delivery_address,payment_method,payment_status,razorpay_order_id,razorpay_payment_id,razorpay_signature,status,subtotal,delivery_charge,total_amount,notes) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
      [id, orderNumber, req.user.id, JSON.stringify(b.deliveryAddress || {}), b.paymentMethod, paymentStatus,
        b.razorpayOrderId || null, b.razorpayPaymentId || null, b.razorpaySignature || null,
        paymentStatus === 'Paid' ? 'Confirmed' : 'Pending', subtotal, safeDeliveryCharge, totalAmount,
        typeof b.notes === 'string' ? b.notes.slice(0, 1000) : null]
    );
    for (const [productId, quantity] of quantities) {
      const p = products.get(productId);
      await db.query('INSERT INTO order_items(id,order_id,product_id,product_name,unit_price,quantity,emoji) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [crypto.randomUUID(), id, p.id, p.name, p.price, quantity, p.emoji]);
      await db.query('UPDATE products SET stock_quantity=stock_quantity-$1,in_stock=(stock_quantity-$1)>0,updated_at=NOW() WHERE id=$2',
        [quantity, productId]);
    }
    await db.query('DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id=$1)', [req.user.id]);
    await db.query('COMMIT');
    res.status(201).json({ success: true, data: await getOrderWithItems(pool, id) });
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    next(e);
  } finally { db.release(); }
};

exports.cancelOrder = async (req, res, next) => {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const found = await db.query('SELECT id,status,payment_status FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE', [req.params.id, req.user.id]);
    if (!found.rowCount) {
      await db.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const order = found.rows[0];
    if (['Delivered', 'Cancelled'].includes(order.status)) {
      await db.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Order cannot be cancelled' });
    }
    if (order.payment_status === 'Paid') {
      await db.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'This order is paid. Please contact support to arrange cancellation and refund.' });
    }
    const items = await db.query('SELECT product_id,quantity FROM order_items WHERE order_id=$1 AND product_id IS NOT NULL', [order.id]);
    for (const item of items.rows) {
      await db.query('UPDATE products SET stock_quantity=stock_quantity+$1,in_stock=TRUE,updated_at=NOW() WHERE id=$2', [item.quantity, item.product_id]);
    }
    await db.query("UPDATE orders SET status='Cancelled',cancelled_at=NOW(),cancel_reason=$1,updated_at=NOW() WHERE id=$2",
      [typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 500) : 'Cancelled by user', order.id]);
    await db.query('COMMIT');
    res.json({ success: true, data: await getOrderWithItems(pool, order.id) });
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    next(e);
  } finally { db.release(); }
};

exports.updateOrderStatus = async (req, res, next) => {
  const db = await pool.connect();
  try {
    const allowed = ['Pending', 'Confirmed', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'];
    if (!allowed.includes(req.body.status)) return res.status(400).json({ success: false, message: 'Invalid order status' });
    await db.query('BEGIN');
    const found = await db.query('SELECT id,status,payment_status FROM orders WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!found.rowCount) {
      await db.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const order = found.rows[0];
    if (order.status === 'Cancelled' && req.body.status !== 'Cancelled') {
      await db.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Cancelled orders cannot be reopened' });
    }
    if (req.body.status === 'Cancelled' && order.status !== 'Cancelled') {
      if (order.status === 'Delivered' || order.payment_status === 'Paid') {
        await db.query('ROLLBACK');
        return res.status(409).json({ success: false, message: 'Delivered or paid orders require a separate refund/cancellation process' });
      }
      const items = await db.query('SELECT product_id,quantity FROM order_items WHERE order_id=$1 AND product_id IS NOT NULL', [order.id]);
      for (const item of items.rows) {
        await db.query('UPDATE products SET stock_quantity=stock_quantity+$1,in_stock=TRUE,updated_at=NOW() WHERE id=$2', [item.quantity, item.product_id]);
      }
      await db.query("UPDATE orders SET status='Cancelled',cancelled_at=NOW(),cancel_reason='Cancelled by admin',updated_at=NOW() WHERE id=$1", [order.id]);
    } else {
      await db.query('UPDATE orders SET status=$1,delivered_at=CASE WHEN $1=$2 THEN NOW() ELSE delivered_at END,updated_at=NOW() WHERE id=$3',
        [req.body.status, 'Delivered', req.params.id]);
    }
    await db.query('COMMIT');
    res.json({ success: true, data: await getOrderWithItems(pool, req.params.id) });
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    next(e);
  } finally { db.release(); }
};
exports.addReview = async (req, res, next) => {
  try {
    const rating = Number(req.body.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5 || !Number.isInteger(rating)) return res.status(400).json({ success: false, message: 'Rating must be an integer from 1 to 5' });
    const review = typeof req.body.review === 'string' ? req.body.review.slice(0, 2000) : '';
    const r = await pool.query("UPDATE orders SET rating=$1,review=$2,updated_at=NOW() WHERE id=$3 AND user_id=$4 AND status='Delivered' RETURNING id",
      [rating, review, req.params.id, req.user.id]);
    if (!r.rowCount) return res.status(400).json({ success: false, message: 'Order not found or not delivered' });
    res.json({ success: true, data: await getOrderWithItems(pool, r.rows[0].id) });
  } catch (e) { next(e); }
};

exports.getAllOrders = async (req, res, next) => {
  try {
    const r = await pool.query('SELECT id FROM orders ORDER BY created_at DESC');
    res.json({ success: true, count: r.rowCount, data: await Promise.all(r.rows.map(x => getOrderWithItems(pool, x.id))) });
  } catch (e) { next(e); }
};
