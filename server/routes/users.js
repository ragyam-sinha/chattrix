import { Router } from 'express';
import User from '../models/User.js';
import Connection from '../models/Connection.js';
import requireAuth from '../middleware/auth.js';

const router = Router();

// All routes require auth
router.use(requireAuth);

// GET /api/users/me — full own profile
router.get('/me', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select('-googleId');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/me — update own profile
router.patch('/me', async (req, res, next) => {
  try {
    const { displayName, bio, statusMessage, isOnboarded } = req.body;

    const updates = {};
    if (displayName !== undefined) updates.displayName = String(displayName).slice(0, 50);
    if (bio !== undefined) updates.bio = String(bio).slice(0, 160);
    if (statusMessage !== undefined) updates.statusMessage = String(statusMessage).slice(0, 80);
    if (isOnboarded !== undefined) updates.isOnboarded = Boolean(isOnboarded);

    const user = await User.findByIdAndUpdate(req.user.userId, updates, {
      new: true,
    }).select('-googleId');

    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/search?q=CX-XXXX-XXXX — exact match search
router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim().toUpperCase();
    if (!q) return res.status(400).json({ error: 'Search query required' });

    const user = await User.findOne({ chatrixId: q }).select(
      '_id chatrixId displayName avatar bio statusMessage'
    );
    if (!user) return res.status(404).json({ error: 'No user found with this Chatrix ID' });

    // Check connection status between searcher and found user
    let connectionStatus = null;
    let connectionId = null;
    const connection = await Connection.findOne({
      $or: [
        { requesterId: req.user.userId, recipientId: user._id },
        { requesterId: user._id, recipientId: req.user.userId },
      ],
    });

    if (connection) {
      connectionStatus = connection.status;
      connectionId = connection._id;
    }

    // Check if searching for self
    const isSelf = user._id.toString() === req.user.userId;

    res.json({
      user: {
        _id: user._id,
        chatrixId: user.chatrixId,
        displayName: user.displayName,
        avatar: user.avatar,
        bio: user.bio,
        statusMessage: user.statusMessage,
      },
      connectionStatus,
      connectionId,
      isSelf,
      // Include direction so UI knows if current user is requester or recipient
      isRequester: connection ? connection.requesterId.toString() === req.user.userId : null,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/:userId — limited public profile
router.get('/:userId', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId).select(
      '_id chatrixId displayName avatar bio statusMessage'
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

export default router;
