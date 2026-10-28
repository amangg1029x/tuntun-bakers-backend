const express=require('express');
const cors=require('cors');
const cookieParser=require('cookie-parser');
require('dotenv').config();
const {clerkMiddleware}=require('@clerk/express');
const pool=require('./config/postgres');
const required=['CLERK_SECRET_KEY','CLIENT_URL','RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET'];
if(!process.env.DATABASE_URL&&!process.env.POSTGRES_URL){console.error('Missing required environment variable: DATABASE_URL (or POSTGRES_URL)');process.exit(1);}
for(const k of required)if(!process.env[k]){console.error('Missing required environment variable: '+k);process.exit(1);}
const app=express();
app.use(express.json());app.use(express.urlencoded({extended:true}));app.use(cookieParser());
app.use(cors({origin:process.env.CLIENT_URL,credentials:true}));app.use(clerkMiddleware());
app.use('/api/auth',require('./routes/authRoutes'));
app.use('/api/user',require('./routes/userRoutes'));
app.use('/api/products',require('./routes/productRoutes'));
app.use('/api/cart',require('./routes/cartRoutes'));
app.use('/api/orders',require('./routes/orderRoutes'));
app.use('/api/favorites',require('./routes/favoriteRoutes'));
app.use('/api/payment',require('./routes/paymentRoutes'));
app.use('/api/admin',require('./routes/adminRoutes'));
app.get('/api',(_,res)=>res.json({success:true,message:'TunTun Bakers API',version:'3.0.0',authentication:'Clerk',database:'PostgreSQL',payment:'Razorpay'}));
app.get('/api/health',async(_,res)=>{try{const r=await pool.query('SELECT NOW() AS database_time');res.json({success:true,database:'connected',databaseTime:r.rows[0].database_time,timestamp:new Date().toISOString()});}catch(e){res.status(503).json({success:false,database:'disconnected'});}});
app.use(require('./middleware/errorHandler'));
const port=process.env.PORT||5000;
pool.query('SELECT 1').then(()=>app.listen(port,()=>console.log('API listening on '+port+' using PostgreSQL'))).catch(e=>{console.error('PostgreSQL connection failed:',e.message);process.exit(1);});
process.on('unhandledRejection',e=>{console.error('Unhandled rejection',e);process.exit(1);});
