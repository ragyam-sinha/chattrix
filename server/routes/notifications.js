import { Router } from 'express';
import { Connection } from '../models/Connection.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

const CHAT_VISIBLE_MESSAGE_QUERY = {
  $or: [{ type: { $exists: false } }, { type: { $in: ['text', 'forward'] } }],
};

// GET /api/notifications — computed notification counts
router.get('/', async (req, res, next) => {
  try {
    const pendingRequestCount = await Connection.countDocuments({
      recipientId: req.user.userId,
      status: 'pending',
    });

    const conversations = await Conversation.find({
      participants: req.user.userId,
    }).select('_id');

    const conversationIds = conversations.map((conversation) => conversation._id);
    const totalUnreadMessages =
      conversationIds.length === 0
        ? 0
        : await Message.countDocuments({
            conversationId: { $in: conversationIds },
            senderId: { $ne: req.user.userId },
            readAt: null,
            ...CHAT_VISIBLE_MESSAGE_QUERY,
          });

    res.json({ pendingRequestCount, totalUnreadMessages });
  } catch (err) {
    next(err);
  }
});

export const notificationRoutes = router;
export default router;
