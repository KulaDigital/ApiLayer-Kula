// routes/leadAdminRoutes.js
// Admin-only lead management endpoints
// Auth: Bearer token + super_admin role (enforced by middleware)

import express from 'express';
import { getLeadsAdmin } from '../services/leadsService.js';

const router = express.Router();

/**
 * GET /api/admin/leads - Get all leads (admin only)
 * Auth: Bearer token + super_admin role
 * Protected by: requireDashboardAuth + requireDashboardRole(['super_admin'])
 * 
 * Query parameters:
 * - clientId: number (optional, filter by specific client)
 * - q: string (search name/email/company)
 * - from: ISO date string (created_at >=)
 * - to: ISO date string (created_at <=)
 * - limit: number (1-100, default 50)
 * - offset: number (default 0)
 * - sort: string (e.g., 'created_at desc', 'email asc', default 'created_at desc')
 * 
 * Response:
 * {
 *   "success": true,
 *   "items": [
 *     {
 *       "id": 1,
 *       "client_id": 5,
 *       "visitor_id": "visitor-123",
 *       "conversation_id": null or number,
 *       "name": "John Doe",
 *       "email": "john@example.com",
 *       "phone": "123-456-7890",
 *       "company": "Acme Corp",
 *       "created_at": "2024-01-15T10:30:00Z",
 *       "updated_at": "2024-01-15T10:30:00Z"
 *     }
 *   ],
 *   "total": 1000,
 *   "limit": 50,
 *   "offset": 0
 * }
 * 
 * Errors:
 * - 401: Missing/invalid token
 * - 403: Not a super_admin user
 * - 500: Server error
 */
router.get('/', async (req, res) => {
  try {
    // Middleware requireDashboardRole(['super_admin']) validates this before reaching handler
    if (!req.dashboardUser || req.dashboardUser.role !== 'super_admin') {
      console.log('❌ Admin leads: Insufficient permissions');
      return res.status(403).json({
        success: false,
        error: 'Super admin access required'
      });
    }

    const { clientId, q, from, to, limit, offset, sort } = req.query;

    console.log(`👨‍💼 Admin fetching all leads with filters:`, { clientId, q, from, to });

    const result = await getLeadsAdmin(req.supabaseClient, {
      clientId: clientId ? parseInt(clientId) : undefined,
      q,
      from,
      to,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
      sort: sort || 'created_at desc'
    });

    console.log(`✅ Admin retrieved ${result.items.length} leads (total: ${result.total})`);

    res.json({
      success: true,
      items: result.items,
      total: result.total,
      limit: result.limit,
      offset: result.offset
    });

  } catch (error) {
    console.error('❌ Admin fetch leads error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch leads',
      details: error.message
    });
  }
});

export default router;
