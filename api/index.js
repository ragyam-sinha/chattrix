import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import connectDB from '../server/config/db.js';
import errorHandler from '../server/middleware/errorHandler.js';
import authRoutes from '../server/routes/auth.js';
import userRoutes from '../server/routes/users.js';
import connectionRoutes from '../server/routes/connections.js';
import chatRoutes from '../server/routes/chats.js';
import notificationRoutes from '../server/routes/notifications.js';

const app = express();

// Connect to MongoDB
await connectDB();

// Security
app.use(helmet({ contentSecurityPolicy: false }));

// CORS
app.use(
  cors({
    origin: process.env.APP_URL || 'http://localhost:5173',
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
