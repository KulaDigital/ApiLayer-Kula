import express from 'express';
import supabase from '../config/database.js';
import { generateApiKey } from '../utils/apiKeyGenerator.js';
import { generateEmbedScript, generateInstallInstructions } from '../utils/embedScriptGenerator.js';

const router = express.Router();

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
    const embedScript = `<script src="${process.env.WIDGET_URL || 'http://localhost:3000/widget.js'}" data-api-key="${apiKey}"></script>`;

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
 */
router.delete('/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Soft delete - set status to inactive
    const { data: client, error } = await supabase
      .from('clients')
      .update({ status: 'inactive' })
      .eq('id', id)
      .select()
      .single();

    if (error || !client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    console.log(`✅ Client ${id} deactivated`);

    res.json({
      success: true,
      message: 'Client deactivated successfully',
      client
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


export default router;
