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
 * Create a new client with auto-generated API key
 */
router.post('/clients', async (req, res) => {
  try {
    const { company_name, website_url, widget_config } = req.body;

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
        status: client.status,
        created_at: client.created_at
      },
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
      .select('id, company_name, website_url, api_key, widget_config, status, created_at')
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
 */
router.get('/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;

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
    const { company_name, website_url, widget_config, status } = req.body;

    // Build update object (only include provided fields)
    const updates = {};
    if (company_name) updates.company_name = company_name;
    if (website_url) updates.website_url = website_url;
    if (widget_config) updates.widget_config = widget_config;
    if (status) updates.status = status;

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


export default router;
