import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getAbly } from '../lib/ably.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/realtime/token
 * Returns an Ably token request so the frontend can authenticate
 * without exposing the server's API key.
 */
router.get('/token', async (req, res, next) => {
  try {
    const ably = getAbly();
    
    // Create a token request scoped to this specific user
    const tokenRequest = await ably.auth.createTokenRequest({
      clientId: req.user.userId,
      capability: {
        // Allow authenticated users to exchange WebRTC signaling data
        // and subscribe to real-time message updates.
        'conversation:*': ['subscribe', 'publish'],
      },
    });

    res.json({ tokenRequest });
  } catch (err) {
    next(err);
  }
});

export const realtimeRoutes = router;
export default router;
