import { Router } from 'express';
import Connection from '../models/Connection.js';
import Conversation from '../models/Conversation.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

// POST /api/connections/request — send connection request
router.post('/request', async (req, res, next) => {
  try {
    const { recipientId } = req.body;
    if (!recipientId) return res.status(400).json({ error: 'recipientId required' });

    const requesterId = req.user.userId;

    // Cannot request self
    if (requesterId === recipientId) {
      return res.status(400).json({ error: 'Cannot send request to yourself' });
    }

    // Check for existing connection in either direction
    const existing = await Connection.findOne({
      $or: [
        { requesterId, recipientId },
        { requesterId: recipientId, recipientId: requesterId },
      ],
    });

    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(400).json({ error: 'Already connected' });
      }
      if (existing.status === 'pending') {
        // If the other user sent a pending request to me, tell the UI
        if (existing.requesterId.toString() === recipientId) {
          return res.status(400).json({
            error: 'This user already sent you a request',
            connectionId: existing._id,
          });
        }
        return res.status(400).json({ error: 'Request already pending' });
      }
      if (existing.status === 'rejected') {
        // Allow re-send after 24 hours
        const hoursSince = (Date.now() - existing.updatedAt.getTime()) / (1000 * 60 * 60);
        if (hoursSince < 24) {
          return res.status(400).json({
            error: 'Request was rejected. You can resend after 24 hours',
          });
        }
        // Reuse the document: flip to pending
        existing.requesterId = requesterId;
        existing.recipientId = recipientId;
        existing.status = 'pending';
        existing.actionBy = requesterId;
        existing.acceptedAt = null;
        await existing.save();
        return res.status(201).json({ connection: existing });
      }
      if (existing.status === 'cancelled') {
        // Reuse the document
        existing.requesterId = requesterId;
        existing.recipientId = recipientId;
        existing.status = 'pending';
        existing.actionBy = requesterId;
        existing.acceptedAt = null;
        await existing.save();
        return res.status(201).json({ connection: existing });
      }
    }

    const connection = await Connection.create({
      requesterId,
      recipientId,
      status: 'pending',
      actionBy: requesterId,
    });

    res.status(201).json({ connection });
  } catch (err) {
    // Handle duplicate key error from compound index
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Connection already exists' });
    }
    next(err);
  }
});

// GET /api/connections/incoming — pending requests where I am recipient
router.get('/incoming', async (req, res, next) => {
  try {
    const connections = await Connection.find({
      recipientId: req.user.userId,
      status: 'pending',
    })
      .populate('requesterId', '_id chatrixId displayName avatar bio')
      .sort({ createdAt: -1 });

    res.json({ connections });
  } catch (err) {
    next(err);
  }
});

// GET /api/connections/outgoing — pending requests where I am requester
router.get('/outgoing', async (req, res, next) => {
  try {
    const connections = await Connection.find({
      requesterId: req.user.userId,
      status: 'pending',
    })
      .populate('recipientId', '_id chatrixId displayName avatar bio')
      .sort({ createdAt: -1 });

    res.json({ connections });
  } catch (err) {
    next(err);
  }
});

// GET /api/connections — all accepted connections (contacts list)
router.get('/', async (req, res, next) => {
  try {
    const connections = await Connection.find({
      $or: [{ requesterId: req.user.userId }, { recipientId: req.user.userId }],
      status: 'accepted',
    })
      .populate('requesterId', '_id chatrixId displayName avatar')
      .populate('recipientId', '_id chatrixId displayName avatar')
      .sort({ acceptedAt: -1 });

    res.json({ connections });
  } catch (err) {
    next(err);
  }
});

// GET /api/connections/status/:targetUserId — check connection status with any user
router.get('/status/:targetUserId', async (req, res, next) => {
  try {
    const connection = await Connection.findOne({
      $or: [
        { requesterId: req.user.userId, recipientId: req.params.targetUserId },
        { requesterId: req.params.targetUserId, recipientId: req.user.userId },
      ],
    });

    if (!connection) {
      return res.json({ connectionStatus: null, connectionId: null });
    }

    res.json({
      connectionStatus: connection.status,
      connectionId: connection._id,
      isRequester: connection.requesterId.toString() === req.user.userId,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/connections/:id/accept
router.patch('/:id/accept', async (req, res, next) => {
  try {
    const connection = await Connection.findById(req.params.id);
    if (!connection) return res.status(404).json({ error: 'Connection not found' });

    // Only recipient can accept
    if (connection.recipientId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Only the recipient can accept' });
    }

    if (connection.status !== 'pending') {
      return res.status(400).json({ error: `Cannot accept a ${connection.status} request` });
    }

    connection.status = 'accepted';
    connection.actionBy = req.user.userId;
    connection.acceptedAt = new Date();
    await connection.save();

    // Auto-create conversation
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

    res.json({ connection, conversationId: conversation._id });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/connections/:id/reject
router.patch('/:id/reject', async (req, res, next) => {
  try {
    const connection = await Connection.findById(req.params.id);
    if (!connection) return res.status(404).json({ error: 'Connection not found' });

    if (connection.recipientId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Only the recipient can reject' });
    }

    if (connection.status !== 'pending') {
      return res.status(400).json({ error: `Cannot reject a ${connection.status} request` });
    }

    connection.status = 'rejected';
    connection.actionBy = req.user.userId;
    await connection.save();

    res.json({ connection });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/connections/:id/cancel
router.patch('/:id/cancel', async (req, res, next) => {
  try {
    const connection = await Connection.findById(req.params.id);
    if (!connection) return res.status(404).json({ error: 'Connection not found' });

    if (connection.requesterId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Only the requester can cancel' });
    }

    if (connection.status !== 'pending') {
      return res.status(400).json({ error: `Cannot cancel a ${connection.status} request` });
    }

    connection.status = 'cancelled';
    connection.actionBy = req.user.userId;
    await connection.save();

    res.json({ connection });
  } catch (err) {
    next(err);
  }
});

export default router;
