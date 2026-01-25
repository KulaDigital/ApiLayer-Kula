import express from 'express';

const router = express.Router();

/**
 * GET /api/client/me
 * Protected: Requires client dashboard role
 * 
 * Returns the client's dashboard info
 * Response (snake_case):
 * {
 *   "role": "client",
 *   "client_id": number | string
 * }
 */
router.get('/me', (req, res) => {
  try {
    // Middleware requireDashboardRole(['client']) validates this before reaching handler
    if (!req.dashboardUser || req.dashboardUser.role !== 'client') {
      return res.status(403).json({
        error: 'Client access required'
      });
    }

    console.log(`✅ /api/client/me: Client access confirmed for user: ${req.user.id}, client_id: ${req.dashboardUser.client_id}`);

    res.json({
      role: req.dashboardUser.role,
      client_id: req.dashboardUser.client_id
    });

  } catch (error) {
    console.error('❌ /api/client/me error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

export default router;
