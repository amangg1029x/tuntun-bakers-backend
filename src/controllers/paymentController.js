const Razorpay=require('razorpay');
const crypto=require('crypto');
const pool=require('../config/postgres');
const razorpay=new Razorpay({key_id:process.env.RAZORPAY_KEY_ID,key_secret:process.env.RAZORPAY_KEY_SECRET});

exports.createRazorpayOrder=async(req,res,next)=>{
 try{
  const {amount,currency='INR',orderId}=req.body||{};
  const value=Number(amount);
  if(!Number.isFinite(value)||value<=0||value>1000000)return res.status(400).json({success:false,message:'Invalid amount'});
  if(currency!=='INR')return res.status(400).json({success:false,message:'Only INR is supported'});
  if(orderId){
   const o=await pool.query('SELECT user_id,total_amount,payment_status FROM orders WHERE id=$1',[orderId]);
   if(!o.rowCount||o.rows[0].user_id!==req.user.id&&req.user.role!=='admin')return res.status(404).json({success:false,message:'Order not found'});
   if(o.rows[0].payment_status==='Paid')return res.status(409).json({success:false,message:'Order already paid'});
   if(Math.round(Number(o.rows[0].total_amount)*100)!==Math.round(value*100))return res.status(400).json({success:false,message:'Amount does not match order'});
  }
  const r=await razorpay.orders.create({amount:Math.round(value*100),currency,receipt:orderId||'order_'+Date.now(),notes:{userId:req.user.id,orderId:orderId||''}});
  res.json({success:true,data:{id:r.id,amount:r.amount,currency:r.currency,keyId:process.env.RAZORPAY_KEY_ID}});
 }catch(e){next(e);}
};

exports.verifyPayment=async(req,res,next)=>{
 try{
  const {razorpay_order_id,razorpay_payment_id,razorpay_signature,orderId}=req.body||{};
  if(![razorpay_order_id,razorpay_payment_id,razorpay_signature,orderId].every(v=>typeof v==='string'&&v.length))return res.status(400).json({success:false,message:'Payment verification failed'});
  const expected=crypto.createHmac('sha256',process.env.RAZORPAY_KEY_SECRET).update(razorpay_order_id+'|'+razorpay_payment_id).digest();
  if(!/^[a-f0-9]{64}$/i.test(razorpay_signature))return res.status(400).json({success:false,message:'Payment verification failed'});
  const supplied=Buffer.from(razorpay_signature,'hex');
  if(supplied.length!==expected.length||!crypto.timingSafeEqual(supplied,expected))return res.status(400).json({success:false,message:'Payment verification failed'});
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   const r=await c.query('SELECT id,status,payment_status,timeline,razorpay_order_id,razorpay_payment_id FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE',[orderId,req.user.id]);
   if(!r.rowCount){await c.query('ROLLBACK');return res.status(404).json({success:false,message:'Order not found'});}
   const o=r.rows[0];
   if(o.razorpay_order_id&&o.razorpay_order_id!==razorpay_order_id){await c.query('ROLLBACK');return res.status(400).json({success:false,message:'Payment order does not match'});}
   if(o.payment_status==='Paid'&&o.razorpay_payment_id!==razorpay_payment_id){await c.query('ROLLBACK');return res.status(409).json({success:false,message:'Order already paid'});}
   const timeline=(o.timeline||[]).map(s=>s.status==='Confirmed'?{...s,completed:true}:s);
   await c.query("UPDATE orders SET payment_status='Paid',razorpay_order_id=$1,razorpay_payment_id=$2,razorpay_signature=$3,status=CASE WHEN status='Pending' THEN 'Confirmed' ELSE status END,timeline=$4::jsonb,updated_at=NOW() WHERE id=$5 AND user_id=$6",[razorpay_order_id,razorpay_payment_id,razorpay_signature,JSON.stringify(timeline),orderId,req.user.id]);
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
  res.json({success:true,message:'Payment verified successfully',paymentId:razorpay_payment_id});
 }catch(e){next(e);}
};

exports.handlePaymentFailure=async(req,res,next)=>{
 try{const {orderId,error}=req.body||{};if(orderId)await pool.query("UPDATE orders SET payment_status='Failed',payment_error=$1,updated_at=NOW() WHERE id=$2 AND user_id=$3 AND payment_status<>'Paid'",[String(error?.description||'Payment failed').slice(0,500),orderId,req.user.id]);res.json({success:true,message:'Payment failure recorded'});}catch(e){next(e);}
};

exports.getPaymentDetails=async(req,res,next)=>{
 try{const r=await pool.query('SELECT id FROM orders WHERE razorpay_payment_id=$1 AND (user_id=$2 OR $3=TRUE)',[req.params.paymentId,req.user.id,req.user.role==='admin']);if(!r.rowCount)return res.status(404).json({success:false,message:'Payment not found'});res.json({success:true,data:await razorpay.payments.fetch(req.params.paymentId)});}catch(e){next(e);}
};

exports.refundPayment=async(req,res,next)=>{
 try{
  const {paymentId,amount}=req.body||{};
  if(!paymentId)return res.status(400).json({success:false,message:'Payment ID is required'});
  const r=await pool.query("SELECT id FROM orders WHERE razorpay_payment_id=$1 AND payment_status='Paid'",[paymentId]);
  if(!r.rowCount)return res.status(404).json({success:false,message:'Paid order not found'});
  let options;
  if(amount!==undefined&&amount!==null&&amount!==''){const n=Number(amount);if(!Number.isFinite(n)||n<=0)return res.status(400).json({success:false,message:'Refund amount must be positive'});options={amount:Math.round(n*100)};}
  const refund=await razorpay.payments.refund(paymentId,options);
  const refundedPaise=Number(refund.amount);
  const original=(await pool.query('SELECT total_amount FROM orders WHERE id=$1',[r.rows[0].id])).rows[0];
  const totalPaise=Math.round(Number(original.total_amount)*100);
  const fullyRefunded=refund.status==='processed'&&Number.isFinite(refundedPaise)&&refundedPaise>=totalPaise;
  if(fullyRefunded) await pool.query("UPDATE orders SET payment_status='Refunded',updated_at=NOW() WHERE id=$1",[r.rows[0].id]);
  res.json({success:true,data:refund});
 }catch(e){next(e);}
};
