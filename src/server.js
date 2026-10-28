const express=require('express');
const cors=require('cors');
const cookieParser=require('cookie-parser');
require('dotenv').config();
const {clerkMiddleware}=require('@clerk/express');
const pool=require('./config/postgres');

const required=['CLERK_SECRET_KEY','CLIENT_URL','RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET'];
if(!process.env.DATABASE_URL&&!process.env.POSTGRES_URL){
  throw new Error('Missing required environment variable: DATABASE_URL (or POSTGRES_URL)');
}
for(const key of required){
  if(!process.env[key]) throw new Error('Missing required environment variable: '+key);
}

const app=express();
app.use(express.json({verify:(req,res,buf)=>{req.rawBody=Buffer.from(buf);}}));
app.use(express.urlencoded({extended:true}));
app.use(cookieParser());
app.use(cors({origin:process.env.CLIENT_URL,credentials:true}));
app.use(clerkMiddleware());

app.use('/api/auth',require('./routes/authRoutes'));
app.use('/api/user',require('./routes/userRoutes'));
app.use('/api/products',require('./routes/productRoutes'));
app.use('/api/cart',require('./routes/cartRoutes'));
app.use('/api/orders',require('./routes/orderRoutes'));
app.use('/api/favorites',require('./routes/favoriteRoutes'));
app.use('/api/payment',require('./routes/paymentRoutes'));
app.use('/api/admin',require('./routes/adminRoutes'));

app.get('/api',(_,res)=>res.json({success:true,message:'TunTun Bakers API',version:'3.0.0',authentication:'Clerk',database:'PostgreSQL',payment:'Razorpay'}));
app.get('/api/health',async(_,res)=>{
  try{
    const result=await pool.query('SELECT NOW() AS database_time');
    res.json({success:true,database:'connected',databaseTime:result.rows[0].database_time,timestamp:new Date().toISOString()});
  }catch(error){
    console.error('Health check PostgreSQL query failed:',error.message);
    res.status(503).json({success:false,database:'disconnected'});
  }
});
app.use(require('./middleware/errorHandler'));

// Vercel imports the Express app as a serverless handler. Only start a listener
// when this file is run directly (for local development / a traditional server).
if(require.main===module){
  const port=process.env.PORT||5000;
  pool.query('SELECT 1')
    .then(()=>app.listen(port,()=>console.log('API listening on '+port+' using PostgreSQL')))
    .catch(error=>{console.error('PostgreSQL connection failed:',error.message);process.exit(1);});
}
module.exports=app;
