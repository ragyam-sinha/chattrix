import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { connectDB } from '../server/config/db.js';
import errorHandler from '../server/middleware/errorHandler.js';
import authRoutes from '../server/routes/auth.js';
import userRoutes from '../server/routes/users.js';
import connectionRoutes from '../server/routes/connections.js';
import chatRoutes from '../server/routes/chats.js';
import notificationRoutes from '../server/routes/notifications.js';

const app = express();

// Ensure DB is connected before handling any request
app.use(async (req, res, next) => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is undefined in the serverless environment');
    }
    await connectDB();
    next();
  } catch (err) {
    console.error('[DB Connection Error]', err.stack);
    res.status(500).json({ 
      error: 'Database connection failed', 
      details: err.message,
      uriExists: !!process.env.MONGODB_URI 
    });
  }
});

// Security
app.use(helmet({ contentSecurityPolicy: false }));

// CORS — dynamically allow the request's origin if it matches known patterns
const allowedOrigins = [
  process.env.APP_URL,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:8888',
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no origin (curl, server-to-server, same-origin on Netlify)
      if (!origin) return callback(null, true);
      // Allow any *.netlify.app subdomain
      if (origin.endsWith('.netlify.app')) return callback(null, true);
      // Allow listed origins
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(null, false);
    },
    credentials: true,
  })
);

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many auth requests, try again later' },
});

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many search requests, try again later' },
});

const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many messages, slow down' },
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/connections', connectionRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/notifications', notificationRoutes);

// Apply message rate limit specifically to send endpoint
app.use('/api/chats/:conversationId/messages', messageLimiter);
app.use('/api/users/search', searchLimiter);

// Error handler
app.use(errorHandler);

// For local development
const PORT = process.env.PORT || 3001;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`[Chatrix API] Running on http://localhost:${PORT}`);
  });
}

export default app;
