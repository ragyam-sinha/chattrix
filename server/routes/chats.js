import { Router } from 'express';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { Connection } from '../models/Connection.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { publishToConversation } from '../lib/ably.js';

const router = Router();
router.use(requireAuth);

// POST /api/chats/open — open or create a direct conversation
router.post('/open', async (req, res, next) => {
  try {
    const { connectionId } = req.body;
    if (!connectionId) return res.status(400).json({ error: 'connectionId required' });

    const connection = await Connection.findById(connectionId);
    if (!connection) return res.status(404).json({ error: 'Connection not found' });

    if (connection.status !== 'accepted') {
      return res.status(403).json({ error: 'Connection is not accepted' });
    }

    // Must be a participant
    const isParticipant =
      connection.requesterId.toString() === req.user.userId ||
      connection.recipientId.toString() === req.user.userId;
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not a participant of this connection' });
    }

    const participants = [connection.requesterId, connection.recipientId].sort();

    let conversation = await Conversation.findOne({
      participants: { $all: participants },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        type: 'direct',
        participants,
        connectionId: connection._id,
        unreadCounts: new Map([
          [connection.requesterId.toString(), 0],
          [connection.recipientId.toString(), 0],
        ]),
      });
    }

    res.json({ conversation });
  } catch (err) {
    next(err);
  }
});

// GET /api/chats — list all conversations for current user
router.get('/', async (req, res, next) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user.userId,
    })
      .populate('participants', '_id chatrixId displayName avatar')
      .populate('connectionId', 'requesterId recipientId requesterCustomName recipientCustomName')
      .sort({ lastMessageAt: -1, createdAt: -1 });

    // Convert to plain objects and include unread count for current user
    const result = conversations.map((conv) => {
      const obj = conv.toObject();
      obj.myUnreadCount = conv.unreadCounts?.get(req.user.userId) || 0;
      return obj;
    });

    res.json({ conversations: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/chats/:conversationId — conversation details
router.get('/:conversationId', async (req, res, next) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId)
      .populate('participants', '_id chatrixId displayName avatar')
      .populate('connectionId', 'requesterId recipientId requesterCustomName recipientCustomName');

    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const isParticipant = conversation.participants.some(
      (p) => p._id.toString() === req.user.userId
    );
    if (!isParticipant) return res.status(403).json({ error: 'Not a participant' });

    const obj = conversation.toObject();
    obj.myUnreadCount = conversation.unreadCounts?.get(req.user.userId) || 0;

    res.json({ conversation: obj });
  } catch (err) {
    next(err);
  }
});

// GET /api/chats/:conversationId/messages?after=<iso>&limit=30
router.get('/:conversationId/messages', async (req, res, next) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const isParticipant = conversation.participants.some(
      (p) => p.toString() === req.user.userId
    );
    if (!isParticipant) return res.status(403).json({ error: 'Not a participant' });

    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const query = { conversationId: req.params.conversationId };

    if (req.query.after) {
      query.createdAt = { $gt: new Date(req.query.after) };
    }

    if (req.query.before) {
      query.createdAt = { ...query.createdAt, $lt: new Date(req.query.before) };
    }

    const messages = await Message.find(query)
      .populate('senderId', '_id chatrixId displayName avatar')
      .sort({ createdAt: req.query.after ? 1 : -1 })
      .limit(limit);

    if (!req.query.after) {
      messages.reverse();
    }

    res.json({ messages });
  } catch (err) {
    next(err);
  }
});

// POST /api/chats/:conversationId/messages — send message
router.post('/:conversationId/messages', async (req, res, next) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const isParticipant = conversation.participants.some(
      (p) => p.toString() === req.user.userId
    );
    if (!isParticipant) return res.status(403).json({ error: 'Not a participant' });

    const connection = await Connection.findById(conversation.connectionId);
    if (!connection || connection.status !== 'accepted') {
      return res.status(403).json({ error: 'Connection is no longer accepted' });
    }

    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Message text required' });
    if (text.length > 4000) return res.status(400).json({ error: 'Message too long (max 4000)' });

    const message = await Message.create({
      conversationId: req.params.conversationId,
      senderId: req.user.userId,
      text,
    });

    const preview = text.length > 100 ? text.slice(0, 100) + '...' : text;

    const otherParticipant = conversation.participants.find(
      (p) => p.toString() !== req.user.userId
    );

    const currentUnread = conversation.unreadCounts?.get(otherParticipant.toString()) || 0;

    await Conversation.findByIdAndUpdate(req.params.conversationId, {
      lastMessageId: message._id,
      lastMessageText: preview,
      lastMessageAt: message.createdAt,
      [`unreadCounts.${otherParticipant.toString()}`]: currentUnread + 1,
    });

    await message.populate('senderId', '_id chatrixId displayName avatar');

    // Publish to Ably — both users get instant push via WebSocket
    try {
      await publishToConversation(req.params.conversationId, 'new_message', {
        message: message.toObject(),
      });
    } catch (ablyErr) {
      // Non-fatal: message is already saved, client will see it on next poll
      console.error('[Ably publish error]', ablyErr.message);
    }

    res.status(201).json({ message });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/chats/:conversationId/read — mark messages as read
router.patch('/:conversationId/read', async (req, res, next) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const isParticipant = conversation.participants.some(
      (p) => p.toString() === req.user.userId
    );
    if (!isParticipant) return res.status(403).json({ error: 'Not a participant' });

    await Message.updateMany(
      {
        conversationId: req.params.conversationId,
        senderId: { $ne: req.user.userId },
        readAt: null,
      },
      { readAt: new Date() }
    );

    await Conversation.findByIdAndUpdate(req.params.conversationId, {
      [`unreadCounts.${req.user.userId}`]: 0,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/chats/messages/:messageId — soft delete a message
router.delete('/messages/:messageId', async (req, res, next) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ error: 'Message not found' });

    if (message.senderId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'You can only delete your own messages' });
    }

    message.isDeleted = true;
    message.text = 'This message was deleted';
    await message.save();

    // Notify both users instantly via Ably
    try {
      await publishToConversation(message.conversationId.toString(), 'message_deleted', {
        messageId: message._id,
      });
    } catch (ablyErr) {
      console.error('[Ably publish error]', ablyErr.message);
    }

    res.json({ message });
  } catch (err) {
    next(err);
  }
});

export const chatRoutes = router;
export default router;
