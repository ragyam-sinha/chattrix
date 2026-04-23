import { Router } from 'express';
import Connection from '../models/Connection.js';
import Conversation from '../models/Conversation.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

// GET /api/notifications — computed notification counts
router.get('/', async (req, res, next) => {
  try {
    const pendingRequestCount = await Connection.countDocuments({
      recipientId: req.user.userId,
      status: 'pending',
    });

    const conversations = await Conversation.find({
      participants: req.user.userId,
    });

    let totalUnreadMessages = 0;
    for (const conv of conversations) {
      totalUnreadMessages += conv.unreadCounts?.get(req.user.userId) || 0;
    }

    res.json({ pendingRequestCount, totalUnreadMessages });
  } catch (err) {
    next(err);
  }
});

export default router;
