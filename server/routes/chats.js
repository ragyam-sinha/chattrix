import { Router } from 'express';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { Connection } from '../models/Connection.js';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { publishToConversation } from '../lib/ably.js';

const router = Router();
router.use(requireAuth);

const CHAT_VISIBLE_MESSAGE_TYPES = new Set(['text', 'forward']);
const CHAT_VISIBLE_MESSAGE_QUERY = {
  $or: [{ type: { $exists: false } }, { type: { $in: [...CHAT_VISIBLE_MESSAGE_TYPES] } }],
};

function isRenderableChatMessage(message) {
  return !!message && (!message.type || CHAT_VISIBLE_MESSAGE_TYPES.has(message.type));
}

function getMessageDisplayText(message) {
  if (!message) return '';
  if (message.isDeleted) return 'This message was deleted';
  const normalized = typeof message.text === 'string' ? message.text.trim() : '';
  return normalized || 'Message';
}

function getMessagePreview(message) {
  if (!isRenderableChatMessage(message)) return '';
  const prefix = message.type === 'forward' ? 'Forwarded: ' : '';
  const preview = `${prefix}${getMessageDisplayText(message)}`;
  return preview.length > 100 ? `${preview.slice(0, 100)}...` : preview;
}

function buildUnreadUpdate(conversation, actorUserId) {
  const updatePayload = {};
  conversation.participants.forEach((participantId) => {
    const participantKey = participantId.toString();
    if (participantKey === actorUserId) return;
    const currentUnread = conversation.unreadCounts?.get(participantKey) || 0;
    updatePayload[`unreadCounts.${participantKey}`] = currentUnread + 1;
  });
  return updatePayload;
}

async function populateMessageForResponse(message) {
  await message.populate('senderId', '_id chatrixId displayName avatar');
  await message.populate({
    path: 'replyToMessageId',
    select: '_id text type isDeleted senderId createdAt',
    populate: {
      path: 'senderId',
      select: '_id chatrixId displayName avatar',
    },
  });
  return message;
}

async function getLatestVisibleMessage(conversationId) {
  return Message.findOne({
    conversationId,
    ...CHAT_VISIBLE_MESSAGE_QUERY,
  })
    .select('_id text type isDeleted createdAt')
    .sort({ createdAt: -1 });
}

async function getVisibleUnreadCount(conversationId, currentUserId) {
  return Message.countDocuments({
    conversationId,
    senderId: { $ne: currentUserId },
    readAt: null,
    ...CHAT_VISIBLE_MESSAGE_QUERY,
  });
}

async function syncConversationPreview(conversationId) {
  const latestVisible = await getLatestVisibleMessage(conversationId);
  const previewUpdate = latestVisible
    ? {
        lastMessageId: latestVisible._id,
        lastMessageText: getMessagePreview(latestVisible),
        lastMessageAt: latestVisible.createdAt,
      }
    : {
        lastMessageId: null,
        lastMessageText: '',
        lastMessageAt: null,
      };

  await Conversation.findByIdAndUpdate(conversationId, previewUpdate);
  return previewUpdate;
}

router.post('/open', async (req, res, next) => {
  try {
    const { connectionId } = req.body;
    if (!connectionId) return res.status(400).json({ error: 'connectionId required' });

    const connection = await Connection.findById(connectionId);
    if (!connection) return res.status(404).json({ error: 'Connection not found' });

    if (connection.status !== 'accepted') {
      return res.status(403).json({ error: 'Connection is not accepted' });
    }

    const isParticipant =
      connection.requesterId.toString() === req.user.userId ||
      connection.recipientId.toString() === req.user.userId;
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not a participant of this connection' });
    }

    const participants = [connection.requesterId, connection.recipientId].sort();

    let conversation = await Conversation.findOne({
      type: 'direct',
      participants: { $all: participants },
      $expr: { $eq: [{ $size: '$participants' }, 2] },
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

router.post('/groups', async (req, res, next) => {
  try {
    const { groupName, memberIds = [] } = req.body;
    const trimmedName = (groupName || '').trim();
    if (!trimmedName) return res.status(400).json({ error: 'groupName required' });
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ error: 'At least one member is required' });
    }

    const currentUserId = req.user.userId;
    const uniqueMembers = [...new Set(memberIds.map((id) => String(id)).filter(Boolean))].filter(
      (id) => id !== currentUserId
    );

    if (uniqueMembers.length === 0) {
      return res.status(400).json({ error: 'Group needs other members' });
    }

    const validUsers = await User.find({ _id: { $in: uniqueMembers } }).select('_id');
    const validIds = new Set(validUsers.map((user) => user._id.toString()));
    const filteredMembers = uniqueMembers.filter((id) => validIds.has(id));

    if (filteredMembers.length === 0) {
      return res.status(400).json({ error: 'No valid group members found' });
    }

    const participants = [currentUserId, ...filteredMembers];
    const unreadCounts = new Map(participants.map((id) => [id.toString(), 0]));

    const conversation = await Conversation.create({
      type: 'group',
      groupName: trimmedName.slice(0, 80),
      participants,
      createdBy: currentUserId,
      unreadCounts,
    });

    const populated = await Conversation.findById(conversation._id)
      .populate('participants', '_id chatrixId displayName avatar')
      .populate('createdBy', '_id displayName chatrixId');

    res.status(201).json({ conversation: populated });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user.userId,
    })
      .populate('participants', '_id chatrixId displayName avatar')
      .populate('connectionId', 'requesterId recipientId requesterCustomName recipientCustomName')
      .populate('createdBy', '_id displayName chatrixId')
      .populate('lastMessageId', '_id text type isDeleted createdAt')
      .sort({ lastMessageAt: -1, createdAt: -1 });

    const result = await Promise.all(
      conversations.map(async (conversation) => {
        const obj = conversation.toObject();
        let previewMessage = conversation.lastMessageId;

        if (!isRenderableChatMessage(previewMessage)) {
          previewMessage = await getLatestVisibleMessage(conversation._id);
        }

        if (previewMessage) {
          obj.lastMessageId = previewMessage._id;
          obj.lastMessageText = getMessagePreview(previewMessage);
          obj.lastMessageAt = previewMessage.createdAt;
        } else {
          obj.lastMessageId = null;
          obj.lastMessageText = '';
          obj.lastMessageAt = null;
        }

        obj.myUnreadCount = await getVisibleUnreadCount(conversation._id, req.user.userId);
        return obj;
      })
    );

    res.json({ conversations: result });
  } catch (err) {
    next(err);
  }
});

router.get('/:conversationId', async (req, res, next) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId)
      .populate('participants', '_id chatrixId displayName avatar')
      .populate('connectionId', 'requesterId recipientId requesterCustomName recipientCustomName')
      .populate('createdBy', '_id displayName chatrixId');

    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const isParticipant = conversation.participants.some(
      (participant) => participant._id.toString() === req.user.userId
    );
    if (!isParticipant) return res.status(403).json({ error: 'Not a participant' });

    const obj = conversation.toObject();
    obj.myUnreadCount = await getVisibleUnreadCount(conversation._id, req.user.userId);

    res.json({ conversation: obj });
  } catch (err) {
    next(err);
  }
});

router.get('/:conversationId/messages', async (req, res, next) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const isParticipant = conversation.participants.some(
      (participant) => participant.toString() === req.user.userId
    );
    if (!isParticipant) return res.status(403).json({ error: 'Not a participant' });

    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const query = {
      conversationId: req.params.conversationId,
      ...CHAT_VISIBLE_MESSAGE_QUERY,
    };

    if (req.query.after) {
      query.createdAt = { $gt: new Date(req.query.after) };
    }

    if (req.query.before) {
      query.createdAt = { ...query.createdAt, $lt: new Date(req.query.before) };
    }

    const messages = await Message.find(query)
      .populate('senderId', '_id chatrixId displayName avatar')
      .populate({
        path: 'replyToMessageId',
        select: '_id text type isDeleted senderId createdAt',
        populate: {
          path: 'senderId',
          select: '_id chatrixId displayName avatar',
        },
      })
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

router.post('/:conversationId/messages', async (req, res, next) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const isParticipant = conversation.participants.some(
      (participant) => participant.toString() === req.user.userId
    );
    if (!isParticipant) return res.status(403).json({ error: 'Not a participant' });

    if (conversation.type === 'direct') {
      const connection = await Connection.findById(conversation.connectionId);
      if (!connection || connection.status !== 'accepted') {
        return res.status(403).json({ error: 'Connection is no longer accepted' });
      }
    }

    const text = (req.body.text || '').trim();
    const replyToMessageId = req.body.replyToMessageId || null;

    if (!text) return res.status(400).json({ error: 'Message text required' });
    if (text.length > 4000) return res.status(400).json({ error: 'Message too long (max 4000)' });

    let replyToMessage = null;
    if (replyToMessageId) {
      replyToMessage = await Message.findOne({
        _id: replyToMessageId,
        conversationId: req.params.conversationId,
        ...CHAT_VISIBLE_MESSAGE_QUERY,
      }).select('_id');

      if (!replyToMessage) {
        return res.status(400).json({ error: 'Reply message not found in this conversation' });
      }
    }

    const message = await Message.create({
      conversationId: req.params.conversationId,
      senderId: req.user.userId,
      text,
      replyToMessageId: replyToMessage?._id || null,
    });

    const updatePayload = {
      lastMessageId: message._id,
      lastMessageText: getMessagePreview(message),
      lastMessageAt: message.createdAt,
      ...buildUnreadUpdate(conversation, req.user.userId),
    };

    await Conversation.findByIdAndUpdate(req.params.conversationId, updatePayload);
    await populateMessageForResponse(message);

    try {
      await publishToConversation(req.params.conversationId, 'new_message', {
        message: message.toObject(),
      });
    } catch (ablyErr) {
      console.error('[Ably publish error]', ablyErr.message);
    }

    res.status(201).json({ message });
  } catch (err) {
    next(err);
  }
});

router.post('/messages/:messageId/forward', async (req, res, next) => {
  try {
    const { conversationIds = [] } = req.body;
    if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
      return res.status(400).json({ error: 'conversationIds required' });
    }

    const sourceMessage = await Message.findById(req.params.messageId).populate(
      'senderId',
      '_id displayName chatrixId'
    );
    if (!sourceMessage) return res.status(404).json({ error: 'Message not found' });
    if (!isRenderableChatMessage(sourceMessage)) {
      return res.status(400).json({ error: 'Only chat messages can be forwarded' });
    }

    const sourceConversation = await Conversation.findById(sourceMessage.conversationId);
    if (!sourceConversation) return res.status(404).json({ error: 'Source conversation not found' });

    const canAccessSource = sourceConversation.participants.some(
      (participant) => participant.toString() === req.user.userId
    );
    if (!canAccessSource) return res.status(403).json({ error: 'Not allowed to forward this message' });

    const targetConversations = await Conversation.find({
      _id: { $in: conversationIds },
      participants: req.user.userId,
    });

    if (targetConversations.length === 0) {
      return res.status(400).json({ error: 'No valid target conversations found' });
    }

    const validTargetConversations = [];
    for (const conversation of targetConversations) {
      if (conversation.type !== 'direct') {
        validTargetConversations.push(conversation);
        continue;
      }

      const connection = await Connection.findById(conversation.connectionId);
      if (connection?.status === 'accepted') {
        validTargetConversations.push(conversation);
      }
    }

    if (validTargetConversations.length === 0) {
      return res.status(400).json({ error: 'No sendable target conversations found' });
    }

    const forwardedText = getMessageDisplayText(sourceMessage);
    const forwardedFromName =
      sourceMessage.senderId?.displayName || sourceMessage.senderId?.chatrixId || '';

    const createdMessages = [];
    for (const conversation of validTargetConversations) {
      const message = await Message.create({
        conversationId: conversation._id,
        senderId: req.user.userId,
        text: forwardedText,
        type: 'forward',
        forwardedFromMessageId: sourceMessage._id,
        forwardedFromName,
      });

      const updatePayload = {
        lastMessageId: message._id,
        lastMessageText: getMessagePreview(message),
        lastMessageAt: message.createdAt,
        ...buildUnreadUpdate(conversation, req.user.userId),
      };

      await Conversation.findByIdAndUpdate(conversation._id, updatePayload);
      await populateMessageForResponse(message);

      try {
        await publishToConversation(conversation._id.toString(), 'new_message', {
          message: message.toObject(),
        });
      } catch (ablyErr) {
        console.error('[Ably publish error]', ablyErr.message);
      }

      createdMessages.push(message);
    }

    res.status(201).json({ messages: createdMessages });
  } catch (err) {
    next(err);
  }
});

router.patch('/:conversationId/read', async (req, res, next) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const isParticipant = conversation.participants.some(
      (participant) => participant.toString() === req.user.userId
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
    await syncConversationPreview(message.conversationId);

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
