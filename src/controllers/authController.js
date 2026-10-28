const crypto=require('crypto');
const pool=require('../config/postgres');
const rowUser=u=>({_id:u.id,id:u.id,clerkId:u.clerk_id,name:u.name,email:u.email,phone:u.phone,role:u.role,isEmailVerified:u.is_email_verified,isPhoneVerified:u.is_phone_verified,preferences:u.preferences,stats:u.stats,createdAt:u.created_at,updatedAt:u.updated_at});

function verifyClerkWebhook(req){
 const secret=process.env.CLERK_WEBHOOK_SECRET;
 const id=req.get('svix-id'),timestamp=req.get('svix-timestamp'),signatures=req.get('svix-signature');
 if(!secret||!id||!timestamp||!signatures||!req.rawBody)return false;
 const seconds=Number(timestamp);
 if(!Number.isFinite(seconds)||Math.abs(Date.now()/1000-seconds)>300)return false;
 const key=Buffer.from(secret.replace(/^whsec_/,''),'base64');
 const expected=crypto.createHmac('sha256',key).update(id+'.'+timestamp+'.').update(req.rawBody).digest('base64');
 return signatures.split(' ').some(part=>{
  const [version,value]=part.split(',');
  if(version!=='v1'||!value)return false;
  const supplied=Buffer.from(value),calculated=Buffer.from(expected);
  return supplied.length===calculated.length&&crypto.timingSafeEqual(supplied,calculated);
 });
}

exports.clerkWebhook=async(req,res)=>{
 try{
  if(!verifyClerkWebhook(req))return res.status(401).json({success:false,message:'Invalid webhook signature'});
  const {type,data}=req.body||{};
  if(type==='user.created'||type==='user.updated'){
   const email=data?.email_addresses?.find(e=>e.id===data.primary_email_address_id)?.email_address||data?.email_addresses?.[0]?.email_address;
   if(!email)return res.status(400).json({success:false,message:'Clerk user has no email address'});
   const phone=data?.phone_numbers?.find(p=>p.id===data.primary_phone_number_id)?.phone_number||data?.phone_numbers?.[0]?.phone_number||null;
   const name=(`${data?.first_name||''} ${data?.last_name||''}`).trim()||'User';
   await pool.query(`INSERT INTO users(id,clerk_id,name,email,phone,is_email_verified,is_phone_verified) VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(clerk_id) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email,phone=EXCLUDED.phone,is_email_verified=EXCLUDED.is_email_verified,is_phone_verified=EXCLUDED.is_phone_verified,updated_at=NOW()`,
    [crypto.randomUUID(),data.id,name,email.toLowerCase(),phone,data?.email_addresses?.some(e=>e.email_address===email&&e.verification?.status==='verified')||false,data?.phone_numbers?.some(p=>p.phone_number===phone&&p.verification?.status==='verified')||false]);
  }else if(type==='user.deleted'&&data?.id){await pool.query('UPDATE users SET clerk_id=NULL,updated_at=NOW() WHERE clerk_id=$1',[data.id]);}
  res.json({success:true});
 }catch(e){console.error('Clerk webhook error:',e.message);res.status(500).json({success:false,message:'Unable to process Clerk webhook'});}
};
exports.getMe=async(req,res,next)=>{try{const r=await pool.query('SELECT * FROM users WHERE id=$1',[req.user.id]);if(!r.rowCount)return res.status(404).json({success:false,message:'User not found'});res.json({success:true,data:rowUser(r.rows[0])});}catch(e){next(e);}};
exports.logout=async(req,res)=>res.json({success:true,message:'Logged out successfully. Complete signout on client.'});
exports.register=async(req,res)=>res.status(410).json({success:false,message:'Registration is handled by Clerk.',redirectTo:'/sign-up'});
exports.login=async(req,res)=>res.status(410).json({success:false,message:'Login is handled by Clerk.',redirectTo:'/sign-in'});
exports.forgotPassword=async(req,res)=>res.status(410).json({success:false,message:'Password reset is handled by Clerk.',redirectTo:'/forgot-password'});
