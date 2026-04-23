import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import generateChatrixId from '../utils/generateChatrixId.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// POST /api/auth/google — verify Google credential, upsert user, issue JWT cookie
router.post('/google', async (req, res, next) => {
  try {
    const { credential, accessToken } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Missing credential' });
    }

    let googleId, email, name, picture;

    if (accessToken) {
      // Access token flow: verify by calling Google's userinfo endpoint
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${credential}` },
      });
      if (!response.ok) {
        return res.status(401).json({ error: 'Invalid access token' });
      }
      const payload = await response.json();
      googleId = payload.sub;
      email = payload.email;
      name = payload.name;
      picture = payload.picture;
    } else {
      // ID token flow: verify using Google's library
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      googleId = payload.sub;
      email = payload.email;
      name = payload.name;
      picture = payload.picture;
    }

    if (!googleId || !email) {
      return res.status(401).json({ error: 'Invalid Google credentials' });
    }

    let user = await User.findOne({ googleId });

    if (!user) {
      const chatrixId = await generateChatrixId(User);
      user = await User.create({
        googleId,
        email,
        name: name || email.split('@')[0],
        avatar: picture || '',
        chatrixId,
        displayName: name || email.split('@')[0],
      });
    } else {
      // Update avatar/name from Google on each login
      user.avatar = picture || user.avatar;
      user.name = name || user.name;
      user.lastSeen = new Date();
      await user.save();
    }

    const token = jwt.sign(
      { userId: user._id.toString(), chatrixId: user.chatrixId },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const isProduction = process.env.NODE_ENV === 'production' || req.headers.origin?.includes('.netlify.app');

    res.cookie('chatrix_session', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    });

    res.json({
      user: {
        _id: user._id,
        chatrixId: user.chatrixId,
        displayName: user.displayName,
        name: user.name,
        avatar: user.avatar,
        isOnboarded: user.isOnboarded,
        email: user.email,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — return current user from JWT (null if no cookie)
router.get('/me', async (req, res, next) => {
  try {
    const token = req.cookies?.chatrix_session;
    if (!token) {
      return res.json({ user: null });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.json({ user: null });
    }

    const user = await User.findById(decoded.userId).select('-googleId');
    if (!user) return res.json({ user: null });

    // Update lastSeen
    user.lastSeen = new Date();
    await user.save();

    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout — clear session cookie
router.post('/logout', requireAuth, (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production' || req.headers.origin?.includes('.netlify.app');
  res.clearCookie('chatrix_session', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
  });
  res.json({ ok: true });
});

export default router;
