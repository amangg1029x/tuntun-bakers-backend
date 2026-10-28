/**
 * Safe PostgreSQL import from a local MongoDB export.
 * Dry run by default; pass --apply to write. Target must be empty.
 * Missing historical order users become non-login placeholders; invalid cart/favorite
 * references are skipped; missing order products retain item snapshots with product_id NULL.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/postgres');

const id = v => v && typeof v === 'object' && v._id != null ? String(v._id) : (v == null ? null : String(v));
const date = v => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };
const str = (v, fallback = null) => v == null ? fallback : String(v);
const num = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const bool = (v, fallback = false) => v == null ? fallback : Boolean(v);
const js = (v, fallback) => JSON.stringify(v == null ? fallback : v);
const en = (v, allowed, fallback) => allowed.includes(v) ? v : fallback;

async function main() {
  const input = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!input) throw new Error('Usage: node src/scripts/import-mongo-export.js <export.json> [--apply]');
  const payload = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
  if (payload.formatVersion !== 1 || !payload.data) throw new Error('Unsupported export format.');
  const d = payload.data;
  for (const k of ['users','products','carts','favorites','orders']) if (!Array.isArray(d[k])) throw new Error('Missing collection: ' + k);

  const users = new Set(d.users.map(x => id(x)));
  const products = new Set(d.products.map(x => id(x)));
  const orphanOrderUsers = new Set(d.orders.map(o => id(o.user)).filter(uid => uid && !users.has(uid)));
  const report = {
    mode: apply ? 'APPLY' : 'DRY RUN',
    sourceCounts: Object.fromEntries(['users','products','carts','favorites','orders'].map(k => [k,d[k].length])),
    placeholderUsersForHistoricalOrders: orphanOrderUsers.size,
    skippedCartsMissingUsers: d.carts.filter(x => !users.has(id(x.user))).length,
    skippedFavoritesMissingUsers: d.favorites.filter(x => !users.has(id(x.user))).length,
    skippedCartItemsMissingProducts: d.carts.reduce((n,x) => n + (x.items||[]).filter(i => !products.has(id(i.product))).length,0),
    skippedFavoriteItemsMissingProducts: d.favorites.reduce((n,x) => n + (x.products||[]).filter(p => !products.has(id(p))).length,0),
    orderItemsPreservedWithoutProductLink: d.orders.reduce((n,x) => n + (x.items||[]).filter(i => id(i.product) && !products.has(id(i.product))).length,0)
  };

  const client = await pool.connect();
  let inTransaction = false;
  try {
    await client.query('BEGIN'); inTransaction = true;
    const check = await client.query("SELECT (SELECT COUNT(*) FROM users)+(SELECT COUNT(*) FROM products)+(SELECT COUNT(*) FROM carts)+(SELECT COUNT(*) FROM favorites)+(SELECT COUNT(*) FROM orders) AS total");
    if (Number(check.rows[0].total) !== 0) throw new Error('Target database is not empty; import refused.');
    // Both modes execute all INSERTs inside this transaction. Dry run rolls back
    // at the end, so it validates real constraints without persisting any rows.

    for (const u of d.users) {
      const uid = id(u); if (!uid) throw new Error('User missing _id');
      await client.query('INSERT INTO users (id,clerk_id,name,email,phone,password_hash,role,is_email_verified,is_phone_verified,preferences,stats,reset_password_token,reset_password_expire,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15)',
        [uid,str(u.clerkId),str(u.name,'Unknown user'),str(u.email,'migration-'+uid+'@invalid.local').toLowerCase(),str(u.phone),str(u.password),en(u.role,['user','admin'],'user'),bool(u.isEmailVerified),bool(u.isPhoneVerified),js(u.preferences,{}),js(u.stats,{}),str(u.resetPasswordToken),date(u.resetPasswordExpire),date(u.createdAt),date(u.updatedAt)]);
      for (const a of u.addresses || []) {
        if (!a.name || !a.phone || !a.address || !a.city || !a.pincode) continue;
        await client.query('INSERT INTO user_addresses (id,user_id,name,phone,address,landmark,city,pincode,is_default,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [id(a) || uid+':address:'+u.addresses.indexOf(a),uid,a.name,a.phone,a.address,str(a.landmark),a.city,a.pincode,bool(a.isDefault),date(a.createdAt)]);
      }
      for (const p of u.savedPaymentMethods || []) {
        if (!p.type || !p.details) continue;
        await client.query('INSERT INTO saved_payment_methods (id,user_id,type,details,is_default,created_at) VALUES ($1,$2,$3,$4,$5,$6)',
          [id(p) || uid+':payment:'+u.savedPaymentMethods.indexOf(p),uid,en(p.type,['upi','card','netbanking'],'upi'),String(p.details),bool(p.isDefault),date(p.createdAt)]);
      }
    }

    for (const p of d.products) {
      const pid = id(p); if (!pid) throw new Error('Product missing _id');
      await client.query('INSERT INTO products (id,name,description,price,category,emoji,image_url,image_public_id,rating,reviews,tags,prep_time,is_new,is_trending,in_stock,stock_quantity,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)',
        [pid,str(p.name,'Unnamed product'),str(p.description,''),num(p.price),en(p.category,['Breads','Cakes','Pastries','Cookies','Specials'],'Specials'),str(p.emoji,'🍞'),str(p.image && p.image.url,''),str(p.image && p.image.publicId,''),num(p.rating),num(p.reviews),Array.isArray(p.tags)?p.tags.map(String):[],str(p.prepTime,'Fresh daily'),bool(p.isNew),bool(p.isTrending),bool(p.inStock,true),Math.max(0,Math.trunc(num(p.stockQuantity,100))),date(p.createdAt),date(p.updatedAt)]);
    }

    for (const uid of orphanOrderUsers) {
      await client.query("INSERT INTO users (id,name,email,role,preferences,stats) VALUES ($1,'Migration placeholder (original user missing)',$2,'user','{}'::jsonb,'{}'::jsonb)",
        [uid,'missing-user-'+uid+'@invalid.local']);
    }

    let cartCount=0, cartItemCount=0, favoriteCount=0, favoriteItemCount=0, orderItemCount=0;
    for (const c of d.carts) {
      const cid=id(c), uid=id(c.user); if (!cid || !users.has(uid)) continue;
      await client.query('INSERT INTO carts (id,user_id,created_at,updated_at) VALUES ($1,$2,$3,$4)',[cid,uid,date(c.createdAt),date(c.updatedAt)]); cartCount++;
      const seen=new Set();
      for (const item of c.items||[]) {
        const pid=id(item.product); if (!pid || !products.has(pid) || seen.has(pid)) continue; seen.add(pid);
        await client.query('INSERT INTO cart_items (id,cart_id,product_id,quantity) VALUES ($1,$2,$3,$4)',[id(item)||cid+':item:'+cartItemCount,cid,pid,Math.max(1,Math.trunc(num(item.quantity,1)))]); cartItemCount++;
      }
    }
    for (const f of d.favorites) {
      const fid=id(f), uid=id(f.user); if (!fid || !users.has(uid)) continue;
      await client.query('INSERT INTO favorites (id,user_id,created_at,updated_at) VALUES ($1,$2,$3,$4)',[fid,uid,date(f.createdAt),date(f.updatedAt)]); favoriteCount++;
      const seen=new Set();
      for (const prod of f.products||[]) {
        const pid=id(prod); if (!pid || !products.has(pid) || seen.has(pid)) continue; seen.add(pid);
        await client.query('INSERT INTO favorite_items (favorite_id,product_id,created_at) VALUES ($1,$2,$3)',[fid,pid,date(f.createdAt)]); favoriteItemCount++;
      }
    }
    for (const o of d.orders) {
      const oid=id(o), uid=id(o.user); if (!oid || !uid) throw new Error('Order missing _id or user reference');
      await client.query('INSERT INTO orders (id,order_number,user_id,delivery_address,payment_method,payment_status,razorpay_order_id,razorpay_payment_id,razorpay_signature,payment_error,status,subtotal,delivery_charge,total_amount,estimated_delivery,delivered_at,cancelled_at,cancel_reason,timeline,notes,rating,review,created_at,updated_at) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,$21,$22,$23,$24)',
        [oid,str(o.orderNumber),uid,js(o.deliveryAddress,{}),en(o.paymentMethod,['upi','cod','card','netbanking','razorpay'],'cod'),en(o.paymentStatus,['Pending','Paid','Refunded','Failed'],'Pending'),str(o.razorpayOrderId),str(o.razorpayPaymentId),str(o.razorpaySignature),str(o.paymentError),en(o.status,['Pending','Confirmed','Preparing','Out for Delivery','Delivered','Cancelled'],'Pending'),num(o.subtotal),num(o.deliveryCharge),num(o.totalAmount),date(o.estimatedDelivery),date(o.deliveredAt),date(o.cancelledAt),str(o.cancelReason),js(o.timeline,[]),str(o.notes),o.rating==null?null:num(o.rating),str(o.review),date(o.createdAt),date(o.updatedAt)]);
      let ix=0;
      for (const item of o.items||[]) {
        const originalProduct=id(item.product), productId=originalProduct && products.has(originalProduct)?originalProduct:null;
        await client.query('INSERT INTO order_items (id,order_id,product_id,product_name,unit_price,quantity,emoji) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [id(item)||oid+':item:'+ix,oid,productId,str(item.name || (item.product&&item.product.name),'Unavailable product'),num(item.price,0),Math.max(1,Math.trunc(num(item.quantity,1))),str(item.emoji)]);
        ix++; orderItemCount++;
      }
    }
    const result = {...report,simulatedOrImported:{users:d.users.length+orphanOrderUsers.size,products:d.products.length,carts:cartCount,cartItems:cartItemCount,favorites:favoriteCount,favoriteItems:favoriteItemCount,orders:d.orders.length,orderItems:orderItemCount}};
    if (apply) {
      await client.query('COMMIT'); inTransaction=false;
      console.log(JSON.stringify(result,null,2));
      console.log('Import committed. Verify row counts and application behavior before any production cutover.');
    } else {
      await client.query('ROLLBACK'); inTransaction=false;
      console.log(JSON.stringify(result,null,2));
      console.log('Dry run passed: all inserts satisfied current SQL constraints, and the transaction was rolled back. No rows were written.');
    }
  } catch (e) {
    if (inTransaction) await client.query('ROLLBACK').catch(()=>{});
    throw e;
  } finally {
    client.release(); await pool.end();
  }
}
main().catch(e=>{ console.error('Import stopped safely:',e.message); process.exitCode=1; });
