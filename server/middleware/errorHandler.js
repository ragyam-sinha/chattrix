export const errorHandler = (err, req, res, _next) => {
  console.error('[Error]', err.stack);
  
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: err.message || 'Internal server error',
    details: err.stack,
    jwtExists: !!process.env.JWT_SECRET,
    googleExists: !!process.env.GOOGLE_CLIENT_ID
  });
};
