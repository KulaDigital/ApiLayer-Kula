import express from 'express';
import supabase from '../config/database.js';
import { getSubscriptionByClientId, formatSubscriptionResponse } from '../services/subscriptionService.js';
import { getLeads } from '../services/leadsService.js';

const router = express.Router();

/**
 * GET /api/client/me
 * Protected: Requires client dashboard role
 * 
 * Returns the client's dashboard info + subscription status
 * Response (snake_case):
 * {
 *   "role": "client",
 *   "client_id": number | string,
 *   "subscription": {
 *     "plan": "professional" | "business" | "enterprise",
 *     "period": "monthly" | "yearly",
 *     "status": "active" | "inactive",
 *     "is_trial": boolean,
 *     "started_at": ISO date string,
 *     "ends_at": ISO date string,
 *     "is_active": boolean (computed: status='active' AND now < ends_at)
 *   } | null,
 *   "has_subscription": boolean
 * }
 */
router.get('/me', async (req, res) => {
  try {
    // Middleware requireDashboardRole(['client']) validates this before reaching handler
    if (!req.dashboardUser || req.dashboardUser.role !== 'client') {
      return res.status(403).json({
        error: 'Client access required'
      });
    }

    const clientId = req.dashboardUser.client_id;

    // Fetch subscription for this client
    let subscription = null;
    let hasSubscription = false;

    if (clientId) {
      const rawSubscription = await getSubscriptionByClientId(clientId);
      if (rawSubscription) {
        subscription = formatSubscriptionResponse(rawSubscription);
        hasSubscription = true;
      }
    }

    console.log(`✅ /api/client/me: Client access confirmed for user: ${req.user.id}, client_id: ${clientId}`);

    res.json({
      role: req.dashboardUser.role,
      client_id: clientId,
      subscription,
      has_subscription: hasSubscription
    });

  } catch (error) {
    console.error('❌ /api/client/me error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/client/conversations
 * Protected: Requires client dashboard role
 * 
 * Returns all conversations for the logged-in client with pagination and filtering
 * Query Parameters:
 *   - page: number (default: 1)
 *   - limit: number (default: 20, max: 100)
 *   - status: 'active' | 'closed' (optional - filter by status)
 *   - sort: 'recent' | 'oldest' (default: 'recent')
 * 
 * Response (200 OK):
 * {
 *   "conversations": [
 *     {
 *       "id": number,
 *       "client_id": number,
 *       "visitor_id": string,
 *       "status": "active" | "closed",
 *       "message_count": number,
 *       "created_at": ISO date string,
 *       "updated_at": ISO date string,
 *       "last_message_preview": string | null,
 *       "last_message_at": ISO date string | null
 *     }
 *   ],
 *   "pagination": {
 *     "current_page": number,
 *     "total_count": number,
 *     "total_pages": number,
 *     "limit": number,
 *     "has_next": boolean,
 *     "has_previous": boolean
 *   }
 * }
 */
router.get('/conversations', async (req, res) => {
  try {
    // Validate client role (middleware handles, but double-check)
    if (!req.dashboardUser || req.dashboardUser.role !== 'client') {
      return res.status(403).json({
        error: 'Client access required'
      });
    }

    const clientId = req.dashboardUser.client_id;

    // Parse query parameters
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const status = req.query.status ? req.query.status.toLowerCase() : null;
    const sort = (req.query.sort || 'recent').toLowerCase();

    // Validate status filter
    if (status && !['active', 'closed'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status. Must be "active" or "closed"'
      });
    }

    // Validate sort
    if (!['recent', 'oldest'].includes(sort)) {
      return res.status(400).json({
        error: 'Invalid sort. Must be "recent" or "oldest"'
      });
    }

    // Build query to fetch conversations
    let query = req.supabaseClient
      .from('conversations')
      .select('*', { count: 'exact' })
      .eq('client_id', clientId);

    // Apply status filter if provided
    if (status) {
      query = query.eq('status', status);
    }

    // Apply sorting
    const ascending = sort === 'oldest';
    query = query.order('last_message_at', { ascending });

    // Apply pagination
    const start = (page - 1) * limit;
    query = query.range(start, start + limit - 1);

    // Execute query
    const { data: conversations, error: convError, count: totalCount } = await query;

    if (convError) {
      console.error('❌ Error fetching conversations:', convError);
      return res.status(500).json({
        error: 'Failed to fetch conversations'
      });
    }

    // Fetch message counts and last message for each conversation
    const conversationsWithDetails = await Promise.all(
      (conversations || []).map(async (conv) => {
        // Get message count
        const { count: messageCount } = await req.supabaseClient
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conv.id);

        // Get last message
        const { data: lastMessages } = await req.supabaseClient
          .from('messages')
          .select('content, created_at')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1);

        const lastMessage = lastMessages?.[0];

        return {
          id: conv.id,
          client_id: conv.client_id,
          visitor_id: conv.visitor_id,
          status: conv.status,
          message_count: messageCount || 0,
          created_at: conv.created_at,
          last_message_at: conv.last_message_at,
          last_message_preview: lastMessage?.content ? lastMessage.content.substring(0, 100) : null
        };
      })
    );

    // Calculate pagination info
    const totalPages = Math.ceil((totalCount || 0) / limit);

    console.log(`✅ /api/client/conversations: Fetched ${conversationsWithDetails.length} conversations for client ${clientId}`);

    res.json({
      conversations: conversationsWithDetails,
      pagination: {
        current_page: page,
        total_count: totalCount || 0,
        total_pages: totalPages,
        limit,
        has_next: page < totalPages,
        has_previous: page > 1
      }
    });

  } catch (error) {
    console.error('❌ /api/client/conversations error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/client/leads
 * Protected: Requires client dashboard role
 * 
 * Returns all leads for the logged-in client with pagination and filtering
 * Query Parameters:
 *   - q: string (search by name/email/company)
 *   - from: ISO date string (created_at >=)
 *   - to: ISO date string (created_at <=)
 *   - limit: number (1-100, default 50)
 *   - offset: number (default 0)
 *   - sort: string (e.g., 'created_at desc', 'email asc', default 'created_at desc')
 * 
 * Response (Status: 200):
 * {
 *   "success": true,
 *   "items": [
 *     {
 *       "id": 1,
 *       "client_id": 1,
 *       "visitor_id": "visitor-123",
 *       "conversation_id": null or number,
 *       "name": "John Doe",
 *       "email": "john@example.com",
 *       "phone": "123-456-7890",
 *       "company": "Acme Corp",
 *       "created_at": "2026-01-15T10:30:00Z",
 *       "updated_at": "2026-01-15T10:30:00Z"
 *     }
 *   ],
 *   "total": 100,
 *   "limit": 50,
 *   "offset": 0
 * }
 * 
 * Error Responses:
 * - 403: Forbidden (client role required)
 * - 500: Server error
 */
router.get('/leads', async (req, res) => {
  try {
    // Validate client role
    if (!req.dashboardUser || req.dashboardUser.role !== 'client') {
      return res.status(403).json({
        error: 'Client access required'
      });
    }

    const clientId = req.dashboardUser.client_id;
    const { q, from, to, limit, offset, sort } = req.query;

    console.log(`🔍 /api/client/leads: Fetching leads for client ${clientId}`);

    // Use admin supabase client (unrestricted) - query is still filtered by clientId for data safety
    const result = await getLeads(supabase, clientId, {
      q,
      from,
      to,
      limit: limit ? Math.min(100, Math.max(1, parseInt(limit))) : 50,
      offset: offset ? Math.max(0, parseInt(offset)) : 0,
      sort: sort || 'created_at desc'
    });

    console.log(`✅ /api/client/leads: Retrieved ${result.items.length} leads (total: ${result.total})`);

    res.json({
      success: true,
      items: result.items,
      total: result.total,
      limit: result.limit,
      offset: result.offset
    });

  } catch (error) {
    console.error('❌ /api/client/leads error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch leads',
      details: error.message
    });
  }
});

export default router;
