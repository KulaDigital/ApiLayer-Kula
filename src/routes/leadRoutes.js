// routes/leadRoutes.js
// Lead capture and retrieval endpoints
// Auth: Hybrid (X-API-Key or Bearer token via hybridAuthMiddleware)

import express from 'express';
import supabase from '../config/database.js';
import {
  validateLeadData,
  validateLeadUpdateData,
  upsertLead,
  getLead,
  getLeads,
  updateLeadStatus,
  updateLeadDetails
} from '../services/leadsService.js';
import { enhanceVisitorId } from '../utils/visitorIdEnhancer.js';
import { createLeadWithEnhancedVisitorId } from '../utils/dbTransactions.js';

const router = express.Router();

/**
 * POST /api/leads - Create or update a lead with enhanced visitor_id
 * Auth: X-API-Key or Bearer token (via hybridAuthMiddleware)
 * 
 * Request body:
 * {
 *   "visitorId": "string" (required) - Format: {org}_{random4digits}
 *   "name": "string" (required) - Full name (will be parsed and enhanced)
 *   "email": "string" (required),
 *   "phone": "string" (optional),
 *   "company": "string" (optional),
 *   "conversationId": "number" (REQUIRED) - Must be valid conversation for this client
 * }
 * 
 * Response (200 OK):
 * {
 *   "success": true,
 *   "lead": {
 *     "id": 12345,
 *     "client_id": 1,
 *     "visitor_id": "kula_digital_solution_john_doe_7657" (enhanced),
 *     "conversation_id": 26,
 *     "name": "John Doe",
 *     "email": "john@example.com",
 *     "phone": "1234567890",
 *     "company": "Acme Corp",
 *     "status": "new",
 *     "created_at": "2026-04-20T10:30:45Z",
 *     "updated_at": "2026-04-20T10:30:45Z"
 *   }
 * }
 * 
 * Error Cases:
 * - 400: Missing required fields or validation failed
 * - 401: Missing/invalid authentication
 * - 403: Conversation doesn't belong to this client
 * - 409: Lead already exists for this visitor
 * - 500: Server error
 */
router.post('/', async (req, res) => {
  try {
    const { visitorId, name, email, phone, company, conversationId } = req.body;

    console.log(`\n📝 Lead capture from visitor ${visitorId}`);

    // Validate input
    const validation = validateLeadData({
      visitorId,
      name,
      email,
      phone,
      company,
      conversationId
    });

    if (!validation.valid) {
      console.log('❌ Validation errors:', validation.errors);
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: validation.errors
      });
    }

    // Generate enhanced visitor_id from name
    const enhancedVisitorId = enhanceVisitorId(visitorId, name);
    console.log(`✨ Enhanced visitor_id: ${visitorId} → ${enhancedVisitorId} | client_id: ${req.clientId}`);

    // Use atomic transaction to create lead with enhanced visitor_id
    console.log(`\n🔐 Verifying conversation ${conversationId} belongs to client ${req.clientId}`);
    const result = await createLeadWithEnhancedVisitorId(
      req.supabaseClient,
      req.clientId,
      conversationId,
      enhancedVisitorId,
      {
        name,
        email,
        phone,
        company
      }
    );

    // Handle transaction result
    if (!result.success) {
      console.log(`❌ Lead creation failed: ${result.error} (code: ${result.code})`);

      // Map error codes to HTTP status codes
      if (result.code === 'FK_NOT_FOUND') {
        return res.status(403).json({
          success: false,
          error: result.error
        });
      }

      if (result.code === 'UNIQUE_VIOLATION') {
        console.warn(`⚠️ Duplicate lead attempt: visitor_id=${enhancedVisitorId} already exists | client_id: ${req.clientId}`);
        return res.status(409).json({
          success: false,
          error: result.error
        });
      }

      // Default to 500 for other errors
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    // Success: Return enhanced lead with updated visitor_id
    console.log(`✅ Lead created: ID=${result.lead.id}, visitor_id=${result.lead.visitor_id}`);

    res.json({
      success: true,
      lead: {
        id: result.lead.id,
        client_id: result.lead.client_id,
        visitor_id: result.lead.visitor_id,
        conversation_id: result.lead.conversation_id,
        name: result.lead.name,
        email: result.lead.email,
        phone: result.lead.phone,
        company: result.lead.company,
        status: result.lead.status,
        created_at: result.lead.created_at,
        updated_at: result.lead.updated_at
      }
    });

  } catch (error) {
    console.error('❌ Lead capture error:', error);
    console.error('   Error details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to capture lead',
      details: error.message
    });
  }
});

/**
 * GET /api/leads - Get leads for authenticated client
 * Auth: X-API-Key or Bearer token (via hybridAuthMiddleware)
 * 
 * Query parameters:
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
 *   "total": 100,
 *   "limit": 50,
 *   "offset": 0
 * }
 * 
 * Errors:
 * - 401: Missing/invalid authentication
 * - 500: Server error
 */
router.get('/', async (req, res) => {
  try {
    const { q, from, to, limit, offset, sort } = req.query;

    console.log(`🔍 Fetching leads for client ${req.clientId}`);

    // Use admin supabase client (unrestricted) - query is still filtered by clientId
    const result = await getLeads(supabase, req.clientId, {
      q,
      from,
      to,
      limit: limit ? Math.min(100, Math.max(1, parseInt(limit))) : 50,
      offset: offset ? Math.max(0, parseInt(offset)) : 0,
      sort: sort || 'created_at desc'
    });

    console.log(`✅ Retrieved ${result.items.length} leads (total: ${result.total})`);

    res.json({
      success: true,
      items: result.items,
      total: result.total,
      limit: result.limit,
      offset: result.offset
    });

  } catch (error) {
    console.error('❌ Fetch leads error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch leads',
      details: error.message
    });
  }
});

/**
 * GET /api/leads/:visitorId - Get a single lead by visitor ID
 * Auth: X-API-Key or Bearer token (via hybridAuthMiddleware)
 * 
 * Response:
 * {
 *   "success": true,
 *   "lead": { ... } or null
 * }
 */
router.get('/:visitorId', async (req, res) => {
  try {
    const { visitorId } = req.params;

    console.log(`🔍 Fetching lead for visitor ${visitorId} (client: ${req.clientId})`);

    const lead = await getLead(req.supabaseClient, req.clientId, visitorId);

    if (!lead) {
      console.log(`⚠️ Lead not found for visitor ${visitorId}`);
      return res.status(404).json({
        success: false,
        error: 'Lead not found'
      });
    }

    console.log(`✅ Found lead: ID=${lead.id}`);

    res.json({
      success: true,
      lead
    });

  } catch (error) {
    console.error('❌ Fetch lead error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch lead',
      details: error.message
    });
  }
});

/**
 * PUT /api/leads/:visitorId - Update lead details
 * Auth: X-API-Key or Bearer token (via hybridAuthMiddleware)
 * 
 * Request body (partial updates):
 * {
 *   "name": "string" (optional),
 *   "email": "string" (optional),
 *   "phone": "string" (optional),
 *   "company": "string" (optional)
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "lead": {
 *     "id": 1,
 *     "visitor_id": "visitor_123",
 *     "name": "Updated Name",
 *     "email": "updated@example.com",
 *     ...
 *   },
 *   "message": "Lead updated successfully"
 * }
 * 
 * Notes:
 * - At least one field must be provided to update
 * - status and conversation_id cannot be updated via this endpoint
 * - Use PUT /:visitorId/status for status updates
 * - conversation_id is preserved and cannot be changed
 * 
 * Errors:
 * - 400: No fields to update or invalid data
 * - 401: Missing/invalid authentication
 * - 404: Lead not found
 * - 500: Server error
 */
router.put('/:visitorId', async (req, res) => {
  try {
    const { visitorId } = req.params;
    const { name, email, phone, company } = req.body;

    console.log(`📝 Updating lead details for visitor ${visitorId}`);

    // Check if at least one field is provided
    if (!name && !email && !phone && !company) {
      return res.status(400).json({
        success: false,
        error: 'At least one field (name, email, phone, company) must be provided'
      });
    }

    // Validate provided fields
    const validation = validateLeadUpdateData({
      name,
      email,
      phone,
      company
    });

    if (!validation.valid) {
      console.log('❌ Validation errors:', validation.errors);
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: validation.errors
      });
    }

    // Update lead details
    const updatedLead = await updateLeadDetails(req.supabaseClient, req.clientId, visitorId, {
      name,
      email,
      phone,
      company
    });

    console.log(`✅ Lead ${updatedLead.id} details updated`);

    res.json({
      success: true,
      lead: updatedLead,
      message: 'Lead updated successfully'
    });

  } catch (error) {
    console.error('❌ Update lead error:', error);

    // Check if it's a "not found" error
    if (error.message.includes('Lead not found')) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update lead',
      details: error.message
    });
  }
});

/**
 * PUT /api/leads/:visitorId/status - Update lead status
 * Auth: X-API-Key or Bearer token (via hybridAuthMiddleware)
 * 
 * Request body:
 * {
 *   "status": "new" | "contacted" | "qualified" | "won" | "lost"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "lead": {
 *     "id": 1,
 *     "status": "contacted",
 *     ...
 *   }
 * }
 * 
 * Status Values:
 * - new: Lead just captured (default)
 * - contacted: Team member has reached out
 * - qualified: Lead is qualified/interested
 * - won: Converted to customer/deal
 * - lost: Lead no longer interested
 * 
 * Errors:
 * - 400: Invalid status value
 * - 401: Missing/invalid authentication
 * - 404: Lead not found
 * - 500: Server error
 */
router.put('/:visitorId/status', async (req, res) => {
  try {
    const { visitorId } = req.params;
    const { status } = req.body;

    console.log(`📝 Updating status for visitor ${visitorId} to: ${status}`);

    // Validate status is provided
    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required'
      });
    }

    // Get the lead first
    const lead = await getLead(req.supabaseClient, req.clientId, visitorId);

    if (!lead) {
      console.log(`⚠️ Lead not found for visitor ${visitorId}`);
      return res.status(404).json({
        success: false,
        error: 'Lead not found'
      });
    }

    // Update status
    const updatedLead = await updateLeadStatus(req.supabaseClient, lead.id, status);

    console.log(`✅ Lead ${lead.id} status updated to: ${status}`);

    res.json({
      success: true,
      lead: updatedLead,
      message: `Lead status updated to ${status}`
    });

  } catch (error) {
    console.error('❌ Update status error:', error);
    
    // Check if it's a validation error (invalid status)
    if (error.message.includes('Invalid status')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update lead status',
      details: error.message
    });
  }
});

export default router;
