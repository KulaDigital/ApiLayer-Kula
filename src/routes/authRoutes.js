import express from 'express';
import { requireDashboardAuth } from '../middleware/dashboardAuth.js';

const router = express.Router();

/**
 * GET /api/me
 * 
 * Returns the caller's dashboard access info
 * Requires valid Bearer token
 * 
 * Response (snake_case):
 * {
 *   "role": "super_admin" | "client",
 *   "client_id": number | string | null,
 *   "user_name": string
 * }
 * 
 * Status codes:
 * 200: Token valid, dashboard_users row exists
 * 401: Missing or invalid token
 * 403: Token valid but no dashboard_users row
 */
router.get('/me', requireDashboardAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Query dashboard_users with user's token (RLS applies)
    const { data: dashboardUser, error } = await req.supabaseClient
      .from('dashboard_users')
      .select('role, client_id, user_name')
      .eq('user_id', userId)
      .single();

    if (error || !dashboardUser) {
      console.log(`❌ No dashboard access for user: ${userId}`);
      return res.status(403).json({
        error: 'No dashboard access'
      });
    }

    console.log(`✅ /api/me: Returned dashboard access for user: ${userId}`);

    res.json({
      role: dashboardUser.role,
      client_id: dashboardUser.client_id,
      user_name: dashboardUser.user_name
    });

  } catch (error) {
    console.error('❌ /api/me error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

export default router;
