const errorHandler=(err,req,res,next)=>{
 console.error(err);
 let status=err.statusCode||500,message=err.message||'Server Error';
 if(err.code==='23505'){status=409;message='A record with this value already exists';}
 else if(err.code==='23503'){status=400;message='Related record does not exist or is still referenced';}
 else if(err.code==='23514'||err.code==='22P02'){status=400;message='Invalid value provided';}
 else if(err.name==='CastError'){status=404;message='Resource not found';}
 else if(err.name==='ValidationError'){status=400;message=Object.values(err.errors||{}).map(v=>v.message).join(', ');}
 res.status(status).json({success:false,message,...(process.env.NODE_ENV==='development'?{stack:err.stack}:{})});
};
module.exports=errorHandler;
