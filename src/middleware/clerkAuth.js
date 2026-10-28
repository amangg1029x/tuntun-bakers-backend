const crypto = require('crypto');
const { clerkClient, clerkMiddleware, requireAuth: clerkRequireAuth } = require('@clerk/express');
const pool = require('../config/postgres');

exports.clerkAuth = async (req, res, next) => {
  try {
    const clerkUserId = req.auth?.userId;
    if (!clerkUserId) return res.status(401).json({success:false,message:'Not authenticated'});
    const cu = await clerkClient.users.getUser(clerkUserId);
    const email = cu.emailAddresses?.find(e=>e.id===cu.primaryEmailAddressId)?.emailAddress || cu.emailAddresses?.[0]?.emailAddress;
    if (!email) return res.status(401).json({success:false,message:'Clerk account must have an email address'});
    const phone = cu.phoneNumbers?.find(p=>p.id===cu.primaryPhoneNumberId)?.phoneNumber || cu.phoneNumbers?.[0]?.phoneNumber || null;
    const name = `${cu.firstName||''} ${cu.lastName||''}`.trim() || 'User';
    const emailVerified = cu.emailAddresses?.some(e=>e.emailAddress===email&&e.verification?.status==='verified')||false;
    const phoneVerified = cu.phoneNumbers?.some(p=>p.phoneNumber===phone&&p.verification?.status==='verified')||false;
    const r = await pool.query(`INSERT INTO users(id,clerk_id,name,email,phone,is_email_verified,is_phone_verified)
      VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(clerk_id) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email,phone=EXCLUDED.phone,
      is_email_verified=EXCLUDED.is_email_verified,is_phone_verified=EXCLUDED.is_phone_verified,updated_at=NOW()
      RETURNING id,clerk_id,name,email,phone,role`,
      [crypto.randomUUID(),clerkUserId,name,email.toLowerCase(),phone,emailVerified,phoneVerified]);
    const u=r.rows[0]; req.user={id:u.id,clerkId:u.clerk_id,name:u.name,email:u.email,phone:u.phone,role:u.role}; next();
  } catch(e) {
    console.error('Clerk PostgreSQL auth error:',e.message);
    if(e.code==='23505') return res.status(409).json({success:false,message:'This email is already associated with another account.'});
    return res.status(401).json({success:false,message:'Authentication failed'});
  }
};
exports.clerkAuthOptional = async(req,res,next)=>{
  try{const id=req.auth?.userId;if(id){const r=await pool.query('SELECT id,clerk_id,name,email,phone,role FROM users WHERE clerk_id=$1',[id]);if(r.rowCount){const u=r.rows[0];req.user={id:u.id,clerkId:u.clerk_id,name:u.name,email:u.email,phone:u.phone,role:u.role};}}next();}
  catch(e){next();}
};
exports.authorize=(...roles)=>(req,res,next)=>{if(!req.user||!roles.includes(req.user.role))return res.status(403).json({success:false,message:`User role ${req.user?.role||'unknown'} is not authorized to access this route`});next();};
exports.requireAuth=clerkRequireAuth();
exports.withAuth=clerkMiddleware();
