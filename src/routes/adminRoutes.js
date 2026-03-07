import express from 'express';
import supabase from '../config/database.js';
import { generateApiKey } from '../utils/apiKeyGenerator.js';
import { generateEmbedScript, generateInstallInstructions } from '../utils/embedScriptGenerator.js';
import {
  getClientIdByCompanyName,
  addDashboardUser,
  getDashboardUser,
  getDashboardUserByClient,
  getDashboardUsersByClient,
  updateDashboardUser,
  deleteDashboardUser,
  getDashboardUsersByStatus,
  getClientsByStatus
} from '../services/dashboardUsersService.js';
import {
  createTrialSubscription,
  getSubscriptionByClientId,
  upsertSubscription,
  cancelSubscription,
  deactivateSubscription,
  formatSubscriptionResponse,
  handleSubscriptionCreated,
  handleSubscriptionCanceled,
  runExpiryJob
} from '../services/subscriptionService.js';

const router = express.Router();

/**
 * GET /api/admin/me
 * Protected: Requires super_admin dashboard role
 * 
 * Returns the super_admin's dashboard info
 * Response (snake_case):
 * {
 *   "role": "super_admin",
 *   "client_id": null
 * }
 */
router.get('/me', (req, res) => {
  try {
    // Middleware requireDashboardRole(['super_admin']) validates this before reaching handler
    if (!req.dashboardUser || req.dashboardUser.role !== 'super_admin') {
      return res.status(403).json({
        error: 'Super admin access required'
      });
    }

    console.log(`✅ /api/admin/me: Super admin access confirmed for user: ${req.user.id}`);

    res.json({
      role: req.dashboardUser.role,
      client_id: req.dashboardUser.client_id
    });

  } catch (error) {
    console.error('❌ /api/admin/me error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Default widget config
const DEFAULT_WIDGET_CONFIG = {
  primaryColor: '#2563EB',
  secondaryColor: '#1E40AF',
  position: 'bottom-right',
  welcomeMessage: 'Hi! How can we help you today?'
};

/**
 * POST /api/admin/clients
 * Create a new client with auto-generated API key and optional subscription
 * 
 * ⚠️ TRIAL CONSTRAINT: If is_trial=true, only professional/monthly is allowed
 * Trial days are ALWAYS fixed to 30 days (cannot be customized)
 * 
 * Request body:
 * {
 *   "company_name": "string" (required),
 *   "website_url": "string" (required),
 *   "widget_config": "object" (optional),
 *   "subscription": {
 *     "is_trial": boolean (optional, default: true),
 *     "plan": "professional" | "business" | "enterprise" (optional, default: professional),
 *     "period": "monthly" | "yearly" (optional, default: monthly)
 *   } (optional)
 * }
 * 
 * Behavior:
 * - If is_trial=true (default):
 *   - plan MUST be 'professional' (enforced)
 *   - period MUST be 'monthly' (enforced)
 *   - trial_days: ALWAYS 30 (fixed, cannot customize)
 * 
 * - If is_trial=false:
 *   - plan can be any: professional | business | enterprise
 *   - period can be any: monthly | yearly
 *   - subscription is active (not trial)
 * 
 * Examples:
 * 1. Default trial: { company_name, website_url } → professional/monthly/30-day trial
 * 2. Paid subscription: { company_name, website_url, subscription: { is_trial: false, plan: "business", period: "yearly" } }
 * 3. Wrong input: { subscription: { is_trial: true, plan: "business" } } → ERROR (plan must be professional for trial)
 */
router.post('/clients', async (req, res) => {
  try {
    const { company_name, website_url, widget_config, subscription: subscriptionConfig } = req.body;

    // Validation
    if (!company_name || !website_url) {
      return res.status(400).json({
        success: false,
        error: 'company_name and website_url are required'
      });
    }

    // Generate unique API key
    const apiKey = generateApiKey();

    // Merge provided config with defaults
    const finalConfig = {
      ...DEFAULT_WIDGET_CONFIG,
      ...(widget_config || {})
    };

    console.log(`\n📝 Creating client: ${company_name}`);
    console.log(`🔑 Generated API key: ${apiKey}`);

    // Insert client
    const { data: client, error } = await supabase
      .from('clients')
      .insert({
        company_name,
        website_url,
        api_key: apiKey,
        widget_config: finalConfig,
        starter_suggestions: null,
        status: 'active',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating client:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create client',
        details: error.message
      });
    }

    // Generate embed script
    const embedScript = `<script src="${process.env.WIDGET_URL}" data-api-key="${apiKey}"></script>`;

    // Create subscription for the new client
    // If subscriptionConfig provided, use those options; otherwise use defaults (trial)
    const subscription = await createTrialSubscription(client.id, subscriptionConfig || {});
    
    if (!subscription) {
      console.warn(`⚠️ Failed to create subscription for client ${client.id}, but client was created successfully`);
    }

    console.log(`✅ Client created successfully (ID: ${client.id})`);

    res.status(201).json({
      success: true,
      message: 'Client created successfully',
      client: {
        id: client.id,
        company_name: client.company_name,
        website_url: client.website_url,
        api_key: client.api_key,
        widget_config: client.widget_config,
        starter_suggestions: client.starter_suggestions,
        status: client.status,
        created_at: client.created_at
      },
      subscription: subscription ? formatSubscriptionResponse(subscription) : null,
      embed_script: embedScript,
      instructions: 'Add the embed_script to your website HTML'
    });

  } catch (error) {
    console.error('❌ Create client error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/clients
 * List all clients with embed scripts
 */
router.get('/clients', async (req, res) => {
  try {
    const { data: clients, error } = await supabase
      .from('clients')
      .select('id, company_name, website_url, api_key, widget_config, starter_suggestions, status, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // ✅ Add embed_script to each client
    const clientsWithScript = clients.map(client => ({
      ...client,
      embed_script: generateEmbedScript(client.api_key)
    }));

    res.json({
      success: true,
      count: clientsWithScript.length,
      clients: clientsWithScript
    });

  } catch (error) {
    console.error('❌ List clients error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch clients'
    });
  }
});

/**
 * GET /api/admin/clients/:id
 * Get single client with installation instructions
 * 
 * Access: super_admin can fetch any client, client users can only fetch their own client
 */
router.get('/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.dashboardUser?.role;
    const userClientId = req.dashboardUser?.client_id;

    // ✅ Client role users can only access their own client data
    if (userRole === 'client' && parseInt(id) !== userClientId) {
      return res.status(403).json({
        success: false,
        error: 'You can only access your own client data'
      });
    }

    const { data: client, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    // ✅ Generate installation instructions
    const installation = generateInstallInstructions(client.api_key);

    res.json({
      success: true,
      client: {
        ...client,
        ...installation  // Includes embed_script, instructions, example
      }
    });

  } catch (error) {
    console.error('❌ Get client error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch client'
    });
  }
});

/**
 * PUT /api/admin/clients/:id
 * Update client configuration
 */
router.put('/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { company_name, website_url, widget_config, status, starter_suggestions } = req.body;

    // Build update object (only include provided fields)
    const updates = {};
    if (company_name) updates.company_name = company_name;
    if (website_url) updates.website_url = website_url;
    if (widget_config) updates.widget_config = widget_config;
    if (status) updates.status = status;
    if (starter_suggestions !== undefined) updates.starter_suggestions = starter_suggestions;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    console.log(`\n📝 Updating client ${id}:`, updates);

    const { data: client, error } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found or update failed'
      });
    }

    console.log(`✅ Client updated successfully`);

    res.json({
      success: true,
      message: 'Client updated successfully',
      client
    });

  } catch (error) {
    console.error('❌ Update client error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update client'
    });
  }
});

/**
 * DELETE /api/admin/clients/:id
 * Delete client (soft delete - set status to inactive)
 * Also soft deletes the associated user if one exists
 */
router.delete('/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get the client to check if it has an associated user
    const { data: client, error: getError } = await supabase
      .from('clients')
      .select('id')
      .eq('id', id)
      .single();

    if (getError || !client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    // Get the associated user (if exists)
    const associatedUser = await getDashboardUserByClient(id);

    // Soft delete the client
    const { data: deletedClient, error: deleteError } = await supabase
      .from('clients')
      .update({ status: 'inactive' })
      .eq('id', id)
      .select()
      .single();

    if (deleteError || !deletedClient) {
      return res.status(500).json({
        success: false,
        error: 'Failed to delete client'
      });
    }

    // Soft delete the associated user if exists
    let deletedUser = null;
    if (associatedUser) {
      const userDeleted = await deleteDashboardUser(associatedUser.user_id);
      if (userDeleted) {
        deletedUser = associatedUser;
        console.log(`✅ Associated user ${associatedUser.user_id} also soft deleted`);
      }
    }

    console.log(`✅ Client ${id} deactivated`);

    res.json({
      success: true,
      message: 'Client and associated user deactivated successfully',
      client: deletedClient,
      associatedUser: deletedUser
    });

  } catch (error) {
    console.error('❌ Delete client error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete client'
    });
  }
});

/**
 * POST /api/admin/clients/:id/regenerate-key
 * Regenerate API key for a client
 */
router.post('/clients/:id/regenerate-key', async (req, res) => {
  try {
    const { id } = req.params;

    // Generate new API key
    const newApiKey = generateApiKey();

    const { data: client, error } = await supabase
      .from('clients')
      .update({ api_key: newApiKey })
      .eq('id', id)
      .select()
      .single();

    if (error || !client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    console.log(`✅ API key regenerated for client ${id}`);

    res.json({
      success: true,
      message: 'API key regenerated successfully',
      api_key: newApiKey,
      warning: 'Update the embed script on the client website with the new API key'
    });

  } catch (error) {
    console.error('❌ Regenerate key error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to regenerate API key'
    });
  }
});

/**
 * GET /api/admin/clients/:client_id/conversations
 * Fetch all conversations for a specific client
 * 
 * Access: super_admin can fetch for any client, client role can fetch their own
 * 
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
router.get('/clients/:client_id/conversations', async (req, res) => {
  try {
    const { client_id } = req.params;
    const userRole = req.dashboardUser?.role;
    const userClientId = req.dashboardUser?.client_id;

    // ✅ Client role users can only access their own client's conversations
    if (userRole === 'client' && parseInt(client_id) !== userClientId) {
      return res.status(403).json({
        error: 'You can only access conversations for your own client'
      });
    }

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
      .eq('client_id', parseInt(client_id));

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

    console.log(`✅ /api/admin/clients/:client_id/conversations: Fetched ${conversationsWithDetails.length} conversations for client ${client_id}`);

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
    console.error('❌ /api/admin/clients/:client_id/conversations error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/clients/:id/embed-script
 * Get only the embed script for a client
 */
router.get('/clients/:id/embed-script', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: client, error } = await supabase
      .from('clients')
      .select('api_key, company_name, status')
      .eq('id', id)
      .single();

    if (error || !client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    const installation = generateInstallInstructions(client.api_key);

    res.json({
      success: true,
      client_name: client.company_name,
      status: client.status,
      ...installation
    });

  } catch (error) {
    console.error('❌ Get embed script error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch embed script'
    });
  }
});

// ============================================
// Clients Status Filter Routes
// ============================================

/**
 * GET /api/admin/clients/status/active
 * Get all active clients
 */
router.get('/clients/status/active', async (req, res) => {
  try {
    const clients = await getClientsByStatus('active');

    res.json({
      success: true,
      status: 'active',
      count: clients.length,
      clients
    });

  } catch (error) {
    console.error('❌ Get active clients error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/clients/status/inactive
 * Get all inactive clients
 */
router.get('/clients/status/inactive', async (req, res) => {
  try {
    const clients = await getClientsByStatus('inactive');

    res.json({
      success: true,
      status: 'inactive',
      count: clients.length,
      clients
    });

  } catch (error) {
    console.error('❌ Get inactive clients error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/clients/status/:status
 * Get clients by status (dynamic)
 */
router.get('/clients/status/:status', async (req, res) => {
  try {
    const { status } = req.params;

    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Allowed values: active, inactive`
      });
    }

    const clients = await getClientsByStatus(status);

    res.json({
      success: true,
      status,
      count: clients.length,
      clients
    });

  } catch (error) {
    console.error(`❌ Get clients by status error:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/clients/with-subscriptions/:status
 * Get all clients with their subscription details in a single call
 * Efficient endpoint for frontend to fetch all clients + subscriptions without N+1 calls
 * 
 * Params:
 * - status: 'active' | 'inactive' (default: 'active')
 * 
 * Response:
 * {
 *   "success": true,
 *   "status": "active",
 *   "count": 5,
 *   "clients": [
 *     {
 *       "id": 1,
 *       "company_name": "Acme Corp",
 *       "website_url": "https://acme.com",
 *       "api_key": "sk_xxx...",
 *       "widget_config": {...},
 *       "status": "active",
 *       "created_at": "2026-01-31T10:00:00Z",
 *       "subscription": {
 *         "plan": "professional",
 *         "period": "monthly",
 *         "status": "active",
 *         "is_trial": true,
 *         "started_at": "2026-01-31T10:00:00Z",
 *         "ends_at": "2026-03-02T10:00:00Z",
 *         "is_entitled": true
 *       }
 *     },
 *     ...
 *   ]
 * }
 */
router.get('/clients/with-subscriptions/:status', async (req, res) => {
  try {
    let { status } = req.params;
    
    // Default to 'active' if not provided
    if (!status) {
      status = 'active';
    }

    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Allowed values: active, inactive`
      });
    }

    console.log(`\n📄 Fetching ${status} clients with subscriptions...`);

    // Get clients by status
    const clients = await getClientsByStatus(status);

    // Fetch subscription for each client
    const clientsWithSubscriptions = await Promise.all(
      clients.map(async (client) => {
        const subscription = await getSubscriptionByClientId(client.id);
        return {
          ...client,
          subscription: subscription ? formatSubscriptionResponse(subscription) : null
        };
      })
    );

    console.log(`✅ Fetched ${clientsWithSubscriptions.length} ${status} clients with subscriptions`);

    res.json({
      success: true,
      status,
      count: clientsWithSubscriptions.length,
      clients: clientsWithSubscriptions
    });

  } catch (error) {
    console.error('❌ Get clients with subscriptions error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// ============================================
// Dashboard Users Management Routes
// ============================================

/**
 * POST /api/admin/users
 * Create a new dashboard user
 * 
 * Request Body:
 * {
 *   "user_id": "uuid",           // Supabase Auth user ID
 *   "company_name": "string",    // Company name (will look up client_id)
 *   "role": "string",            // Allowed values: "super_admin", "client"
 *   "user_name": "string",       // Full name of the user
 *   "phone_number": "string"     // Optional: Phone number
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Dashboard user created successfully",
 *   "user": {
 *     "user_id": "uuid",
 *     "client_id": number,
 *     "role": "string",
 *     "user_name": "string",
 *     "phone_number": "string|null",
 *     "created_at": "ISO timestamp"
 *   }
 * }
 */
router.post('/users', async (req, res) => {
  try {
    const { user_id, company_name, role, user_name, phone_number } = req.body;

    // Validation
    if (!user_id || !company_name || !role || !user_name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: user_id, company_name, role, user_name'
      });
    }

    // Validate role
    const validRoles = ['super_admin', 'client'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: `Invalid role '${role}'. Allowed roles: ${validRoles.join(', ')}`
      });
    }

    // Get client_id from company_name
    const client_id = await getClientIdByCompanyName(company_name);
    if (!client_id) {
      return res.status(404).json({
        success: false,
        error: `Client not found with company_name: ${company_name}`
      });
    }

    // Add the user
    const user = await addDashboardUser({
      user_id,
      client_id,
      role,
      user_name,
      phone_number
    });

    if (!user) {
      // Check if error is due to one-to-one constraint
      const existingUser = await getDashboardUserByClient(client_id);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: `Client '${company_name}' already has a user assigned. One client can only have one user.`
        });
      }
      
      return res.status(500).json({
        success: false,
        error: 'Failed to create dashboard user'
      });
    }

    console.log(`✅ Dashboard user created: ${user_name}`);

    res.status(201).json({
      success: true,
      message: 'Dashboard user created successfully',
      user
    });

  } catch (error) {
    console.error('❌ Create dashboard user error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/users
 * Get all dashboard users
 */
router.get('/users', async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('dashboard_users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching dashboard users:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch dashboard users'
      });
    }

    res.json({
      success: true,
      count: users.length,
      users
    });

  } catch (error) {
    console.error('❌ List all dashboard users error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/users/:user_id
 * Get a specific dashboard user
 */
router.get('/users/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;

    const user = await getDashboardUser(user_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Dashboard user not found'
      });
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    console.error('❌ Get dashboard user error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/users/client/:client_id
 * Get the user for a specific client (one-to-one relationship)
 */
router.get('/users/client/:client_id', async (req, res) => {
  try {
    const { client_id } = req.params;

    const user = await getDashboardUserByClient(parseInt(client_id));

    if (!user) {
      return res.status(404).json({
        success: true,
        message: 'No user assigned to this client',
        user: null
      });
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    console.error('❌ Get client user error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * PUT /api/admin/users/:user_id
 * Update a dashboard user
 * 
 * Request Body (all optional):
 * {
 *   "role": "string",            // Allowed values: "super_admin", "client"
 *   "user_name": "string",
 *   "phone_number": "string"
 * }
 */
router.put('/users/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    const { role, user_name, phone_number } = req.body;

    // Build update object (only include provided fields)
    const updates = {};
    if (role) updates.role = role;
    if (user_name) updates.user_name = user_name;
    if (phone_number !== undefined) updates.phone_number = phone_number || null;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    // Validate role if provided
    if (role) {
      const validRoles = ['super_admin', 'client'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          error: `Invalid role '${role}'. Allowed roles: ${validRoles.join(', ')}`
        });
      }
    }

    const user = await updateDashboardUser(user_id, updates);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Dashboard user not found or update failed'
      });
    }

    console.log(`✅ Dashboard user updated: ${user_id}`);

    res.json({
      success: true,
      message: 'Dashboard user updated successfully',
      user
    });

  } catch (error) {
    console.error('❌ Update dashboard user error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * DELETE /api/admin/users/:user_id
 * Delete a dashboard user (soft delete - set status to inactive)
 * Also soft deletes the associated client
 */
router.delete('/users/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;

    // Get the user to find its client
    const user = await getDashboardUser(user_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Dashboard user not found'
      });
    }

    // Soft delete the user
    const userDeleted = await deleteDashboardUser(user_id);
    if (!userDeleted) {
      return res.status(500).json({
        success: false,
        error: 'Failed to delete dashboard user'
      });
    }

    // Soft delete the associated client
    const { data: deletedClient, error: clientDeleteError } = await supabase
      .from('clients')
      .update({ status: 'inactive' })
      .eq('id', user.client_id)
      .select()
      .single();

    if (clientDeleteError) {
      console.error('⚠️ Warning: Failed to delete associated client:', clientDeleteError);
    } else if (deletedClient) {
      console.log(`✅ Associated client ${user.client_id} also soft deleted`);
    }

    console.log(`✅ Dashboard user deleted: ${user_id}`);

    res.json({
      success: true,
      message: 'Dashboard user and associated client deactivated successfully',
      user,
      associatedClient: deletedClient || null
    });

  } catch (error) {
    console.error('❌ Delete dashboard user error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// ============================================
// Dashboard Users Status Filter Routes
// ============================================

/**
 * GET /api/admin/users/status/active
 * Get all active dashboard users
 */
router.get('/users/status/active', async (req, res) => {
  try {
    const users = await getDashboardUsersByStatus('active');

    res.json({
      success: true,
      status: 'active',
      count: users.length,
      users
    });

  } catch (error) {
    console.error('❌ Get active users error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/users/status/inactive
 * Get all inactive dashboard users
 */
router.get('/users/status/inactive', async (req, res) => {
  try {
    const users = await getDashboardUsersByStatus('inactive');

    res.json({
      success: true,
      status: 'inactive',
      count: users.length,
      users
    });

  } catch (error) {
    console.error('❌ Get inactive users error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/users/status/:status
 * Get users by status (dynamic)
 */
router.get('/users/status/:status', async (req, res) => {
  try {
    const { status } = req.params;

    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Allowed values: active, inactive`
      });
    }

    const users = await getDashboardUsersByStatus(status);

    res.json({
      success: true,
      status,
      count: users.length,
      users
    });

  } catch (error) {
    console.error(`❌ Get users by status error:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// ============================================
// Subscription Management Endpoints (MVP)
// ============================================

/**
 * POST /api/admin/clients/:clientId/subscription
 * Upsert (create or update) subscription for a client
 * Super admin only
 * 
 * Request body:
 * {
 *   "plan": "professional" | "business" | "enterprise",
 *   "period": "monthly" | "yearly",
 *   "status": "active" | "inactive",
 *   "is_trial": boolean (optional, default false),
 *   "started_at": ISO date string,
 *   "ends_at": ISO date string
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Subscription upserted successfully",
 *   "subscription": {
 *     "plan", "period", "status", "is_trial", "started_at", "ends_at", "is_active"
 *   }
 * }
 */
router.post('/clients/:clientId/subscription', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { plan, period, status, is_trial, started_at, ends_at } = req.body;

    // Parse clientId as integer
    const client_id = parseInt(clientId, 10);
    if (isNaN(client_id) || client_id <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid clientId. Must be a positive integer'
      });
    }

    // Validate required fields
    if (!plan || !period || !status || !started_at || !ends_at) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: plan, period, status, started_at, ends_at'
      });
    }

    console.log(`\n📝 Upserting subscription for client_id: ${client_id}`);

    // Use the subscription service to upsert
    const subscription = await upsertSubscription(client_id, {
      plan,
      period,
      status,
      is_trial: is_trial || false,
      started_at,
      ends_at
    });

    if (!subscription) {
      return res.status(400).json({
        success: false,
        error: 'Failed to upsert subscription. Check validation errors.'
      });
    }

    console.log(`✅ Subscription upserted for client_id: ${client_id}`);

    res.json({
      success: true,
      message: 'Subscription upserted successfully',
      subscription: formatSubscriptionResponse(subscription)
    });

  } catch (error) {
    console.error('❌ Upsert subscription error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

/**
 * POST /api/admin/clients/:clientId/subscription/cancel
 * Cancel subscription for a client
 * Supports immediate or end-of-period cancellation
 * Super admin only
 * 
 * Request body (optional):
 * {
 *   "cancelType": "immediate" | "end-of-period" (default: "immediate")
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Subscription canceled successfully",
 *   "subscription": {
 *     "plan", "period", "status", "is_trial", "started_at", "ends_at", "is_entitled"
 *   }
 * }
 */
router.post('/clients/:clientId/subscription/cancel', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { cancelType = 'immediate' } = req.body;

    // Parse clientId as integer
    const client_id = parseInt(clientId, 10);
    if (isNaN(client_id) || client_id <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid clientId. Must be a positive integer'
      });
    }

    if (!['immediate', 'end-of-period'].includes(cancelType)) {
      return res.status(400).json({
        success: false,
        error: 'cancelType must be "immediate" or "end-of-period"'
      });
    }

    console.log(`\n📝 Canceling subscription for client_id: ${client_id} (${cancelType})`);

    // Use the subscription service to cancel
    const subscription = await cancelSubscription(client_id, cancelType);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: 'Subscription not found or could not be canceled'
      });
    }

    console.log(`✅ Subscription canceled for client_id: ${client_id} (${cancelType})`);

    res.json({
      success: true,
      message: 'Subscription canceled successfully',
      subscription: formatSubscriptionResponse(subscription)
    });

  } catch (error) {
    console.error('❌ Cancel subscription error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

/**
 * POST /api/admin/clients/:clientId/subscription/deactivate
 * @deprecated Use /cancel endpoint instead
 * Backward compatibility wrapper
 */
router.post('/clients/:clientId/subscription/deactivate', async (req, res) => {
  try {
    const { clientId } = req.params;
    
    // Forward to cancel endpoint with immediate cancellation
    req.body = { cancelType: 'immediate' };
    
    // Reuse cancel endpoint handler
    const client_id = parseInt(clientId, 10);
    if (isNaN(client_id) || client_id <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid clientId. Must be a positive integer'
      });
    }

    const subscription = await cancelSubscription(client_id, 'immediate');

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: 'Subscription not found or could not be canceled'
      });
    }

    res.json({
      success: true,
      message: 'Subscription canceled successfully',
      subscription: formatSubscriptionResponse(subscription)
    });

  } catch (error) {
    console.error('❌ Deactivate subscription error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

/**
 * GET /api/admin/clients/:clientId/subscription
 * Get subscription for a client
 * Super admin only
 * 
 * Response:
 * {
 *   "success": true,
 *   "subscription": {
 *     "plan", "period", "status", "is_trial", "started_at", "ends_at", "is_active"
 *   } | null
 * }
 */
router.get('/clients/:clientId/subscription', async (req, res) => {
  try {
    const { clientId } = req.params;

    // Parse clientId as integer
    const client_id = parseInt(clientId, 10);
    if (isNaN(client_id) || client_id <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid clientId. Must be a positive integer'
      });
    }

    console.log(`\n📄 Fetching subscription for client_id: ${client_id}`);

    // Get subscription
    const subscription = await getSubscriptionByClientId(client_id);

    res.json({
      success: true,
      subscription: subscription ? formatSubscriptionResponse(subscription) : null
    });

  } catch (error) {
    console.error('❌ Get subscription error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// ============================================
// Webhook Handlers (for Stripe/Payment Provider)
// ============================================

/**
 * POST /api/admin/webhooks/subscription-created
 * Handle payment provider webhook: subscription created or payment successful
 * Idempotent: safe to replay
 * 
 * Request body:
 * {
 *   "client_id": number,
 *   "stripe_subscription_id": string (optional),
 *   "plan": "professional" | "business" | "enterprise",
 *   "period": "monthly" | "yearly",
 *   "starts_at": ISO date string,
 *   "ends_at": ISO date string (required),
 *   "is_trial": boolean (optional)
 * }
 */
router.post('/webhooks/subscription-created', async (req, res) => {
  try {
    const { client_id, ...eventData } = req.body;

    if (!client_id) {
      return res.status(400).json({
        success: false,
        error: 'client_id is required'
      });
    }

    if (!eventData.ends_at) {
      return res.status(400).json({
        success: false,
        error: 'ends_at is required in webhook event'
      });
    }

    console.log(`\n🔔 Webhook received: subscription created for client_id: ${client_id}`);

    const subscription = await handleSubscriptionCreated(client_id, eventData);

    if (!subscription) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create subscription from webhook'
      });
    }

    res.json({
      success: true,
      message: 'Subscription created from webhook',
      subscription: formatSubscriptionResponse(subscription)
    });

  } catch (error) {
    console.error('❌ Webhook subscription-created error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

/**
 * POST /api/admin/webhooks/subscription-canceled
 * Handle payment provider webhook: subscription canceled
 * Idempotent: safe to replay
 * 
 * Request body:
 * {
 *   "client_id": number,
 *   "cancel_type": "immediate" | "end-of-period" (default: "immediate")
 * }
 */
router.post('/webhooks/subscription-canceled', async (req, res) => {
  try {
    const { client_id, cancel_type = 'immediate', ...eventData } = req.body;

    if (!client_id) {
      return res.status(400).json({
        success: false,
        error: 'client_id is required'
      });
    }

    if (!['immediate', 'end-of-period'].includes(cancel_type)) {
      return res.status(400).json({
        success: false,
        error: 'cancel_type must be "immediate" or "end-of-period"'
      });
    }

    console.log(`\n🔔 Webhook received: subscription canceled for client_id: ${client_id} (${cancel_type})`);

    const subscription = await handleSubscriptionCanceled(client_id, eventData, cancel_type);

    if (!subscription) {
      return res.status(500).json({
        success: false,
        error: 'Failed to cancel subscription from webhook'
      });
    }

    res.json({
      success: true,
      message: 'Subscription canceled from webhook',
      subscription: formatSubscriptionResponse(subscription)
    });

  } catch (error) {
    console.error('❌ Webhook subscription-canceled error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

// ============================================
// Scheduled Jobs (Cron)
// ============================================

/**
 * POST /api/admin/jobs/expire-subscriptions
 * Scheduled expiry job (call periodically via cron or Supabase functions)
 * Sets status='expired' for all active subscriptions where ends_at <= now()
 * Idempotent: safe to rerun multiple times
 */
router.post('/jobs/expire-subscriptions', async (req, res) => {
  try {
    console.log(`\n⏰ Expiry job triggered`);

    const result = await runExpiryJob();

    if (result.error) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      message: 'Expiry job completed',
      updated_count: result.updated_count
    });

  } catch (error) {
    console.error('❌ Expiry job error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

export default router;
