// services/leadsService.js
// Business logic for lead management: validation, upsert, retrieval, filtering

/**
 * Validate required and optional fields for a lead
 * @param {Object} data - Lead data to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateLeadData(data) {
  const errors = [];

  // Required fields
  if (!data.visitorId || typeof data.visitorId !== 'string' || data.visitorId.trim() === '') {
    errors.push('visitorId is required and must be a non-empty string');
  }

  if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
    errors.push('name is required and must be a non-empty string');
  }

  if (!data.email || typeof data.email !== 'string' || data.email.trim() === '') {
    errors.push('email is required and must be a non-empty string');
  }

  // Simple email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (data.email && !emailRegex.test(data.email.trim())) {
    errors.push('email must be a valid email address');
  }

  // Optional fields validation (if provided)
  if (data.phone && typeof data.phone !== 'string') {
    errors.push('phone must be a string');
  }

  if (data.company && typeof data.company !== 'string') {
    errors.push('company must be a string');
  }

  if (data.conversationId && typeof data.conversationId !== 'number') {
    errors.push('conversationId must be a number');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate lead update data (partial updates allowed)
 * @param {Object} data - Lead data to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateLeadUpdateData(data) {
  const errors = [];

  // Optional fields validation (if provided)
  if (data.name && typeof data.name !== 'string') {
    errors.push('name must be a string');
  }

  if (data.email && typeof data.email !== 'string') {
    errors.push('email must be a string');
  }

  // Simple email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (data.email && !emailRegex.test(data.email.trim())) {
    errors.push('email must be a valid email address');
  }

  if (data.phone && typeof data.phone !== 'string') {
    errors.push('phone must be a string');
  }

  if (data.company && typeof data.company !== 'string') {
    errors.push('company must be a string');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Upsert a lead: Insert if new, update name/email/phone/company if exists
 * IMPORTANT: conversation_id is NEVER overwritten on update (stays original or null)
 * 
 * @param {Object} supabaseClient - Supabase client
 * @param {number} clientId - Client ID
 * @param {string} visitorId - Visitor ID
 * @param {Object} leadData - Lead data { name, email, phone, company, conversationId }
 * @returns {Object} Upserted lead with { id, client_id, visitor_id, conversation_id, name, email, phone, company, created_at, updated_at }
 */
export async function upsertLead(supabaseClient, clientId, visitorId, leadData) {
  try {
    console.log(`📝 Upserting lead for visitor: ${visitorId} (client: ${clientId})`);

    // Build the upsert payload
    const payload = {
      client_id: clientId,
      visitor_id: visitorId,
      name: leadData.name?.trim(),
      email: leadData.email?.trim(),
      phone: leadData.phone?.trim() || null,
      company: leadData.company?.trim() || null,
      // Only include conversation_id if explicitly provided
      ...(leadData.conversationId && { conversation_id: leadData.conversationId })
    };

    const { data, error } = await supabaseClient
      .from('leads')
      .upsert(payload, {
        onConflict: 'client_id,visitor_id'
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Upsert error:', error);
      throw new Error(`Failed to upsert lead: ${error.message}`);
    }

    console.log(`✅ Lead upserted successfully (ID: ${data.id})`);
    return data;
  } catch (error) {
    console.error('❌ upsertLead error:', error);
    throw error;
  }
}

/**
 * Get a single lead by client_id and visitor_id
 * @param {Object} supabaseClient - Supabase client
 * @param {number} clientId - Client ID
 * @param {string} visitorId - Visitor ID
 * @returns {Object} Lead or null
 */
export async function getLead(supabaseClient, clientId, visitorId) {
  try {
    const { data, error } = await supabaseClient
      .from('leads')
      .select('*')
      .eq('client_id', clientId)
      .eq('visitor_id', visitorId)
      .maybeSingle();

    if (error) {
      console.error('❌ Get lead error:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('❌ getLead error:', error);
    throw error;
  }
}

/**
 * Update lead details (name, email, phone, company)
 * Partial updates allowed - only provided fields are updated
 * @param {Object} supabaseClient - Supabase client
 * @param {number} clientId - Client ID
 * @param {string} visitorId - Visitor ID
 * @param {Object} updateData - Data to update { name, email, phone, company }
 * @returns {Object} Updated lead
 */
export async function updateLeadDetails(supabaseClient, clientId, visitorId, updateData) {
  try {
    console.log(`📝 Updating lead details for visitor ${visitorId}`);

    // First, get the lead to verify it exists and belongs to client
    const existingLead = await getLead(supabaseClient, clientId, visitorId);

    if (!existingLead) {
      throw new Error('Lead not found');
    }

    // Build update object with only provided fields
    const updatePayload = {};
    if (updateData.name !== undefined) updatePayload.name = updateData.name;
    if (updateData.email !== undefined) updatePayload.email = updateData.email;
    if (updateData.phone !== undefined) updatePayload.phone = updateData.phone;
    if (updateData.company !== undefined) updatePayload.company = updateData.company;

    // If no fields to update, return existing lead
    if (Object.keys(updatePayload).length === 0) {
      console.log(`⚠️ No fields to update for lead ${existingLead.id}`);
      return existingLead;
    }

    const { data, error } = await supabaseClient
      .from('leads')
      .update(updatePayload)
      .eq('id', existingLead.id)
      .select()
      .single();

    if (error) {
      console.error('❌ updateLeadDetails database error:', error);
      throw error;
    }

    if (!data) {
      throw new Error('Failed to update lead');
    }

    console.log(`✅ Lead ${existingLead.id} details updated successfully`);
    return data;
  } catch (error) {
    console.error('❌ updateLeadDetails error:', error);
    throw error;
  }
}

/**
 * Get leads for a specific client with filtering, searching, and pagination
 * 
 * @param {Object} supabaseClient - Supabase client (should be admin client for unrestricted access)
 * @param {number} clientId - Client ID
 * @param {Object} filters - Filter options {
 *   q: string (search name/email/company),
 *   from: ISO string (created_at >=),
 *   to: ISO string (created_at <=),
 *   limit: number (default 50, max 100),
 *   offset: number (default 0),
 *   sort: string (e.g., 'created_at desc', default 'created_at desc')
 * }
 * @returns {Object} { items: Lead[], total: number, limit, offset }
 */
export async function getLeads(supabaseClient, clientId, filters = {}) {
  try {
    const {
      q,
      from,
      to,
      limit = 50,
      offset = 0,
      sort = 'created_at desc'
    } = filters;

    // Validate pagination
    const finalLimit = Math.min(Math.max(1, limit), 100); // 1-100
    const finalOffset = Math.max(0, offset);

    console.log(`🔍 Fetching leads for client ${clientId}`);
    console.log(`   Filters: q="${q}", from="${from}", to="${to}", sort="${sort}"`);
    console.log(`   Pagination: limit=${finalLimit}, offset=${finalOffset}`);

    // Debug: Check if ANY leads exist for this client
    const { count: debugCount, error: debugCountError } = await supabaseClient
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId);
    
    if (debugCountError) {
      console.warn(`⚠️ DEBUG count error: ${debugCountError.message}`);
    }
    console.log(`📊 DEBUG: Total leads for client ${clientId} in database: ${debugCount || 0}`);

    // First, get the total count with filters
    let countQuery = supabaseClient
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId);

    console.log(`   Step 1: Filter by client_id=${clientId}`);

    // Step 2: Apply search filter (name, email, company)
    if (q && q.trim()) {
      const searchTerm = q.trim();
      console.log(`   Step 2: Apply search filter for "${searchTerm}"`);
      countQuery = countQuery.or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,company.ilike.%${searchTerm}%`);
    }

    // Step 3: Apply date range filters
    if (from) {
      console.log(`   Step 3a: Filter created_at >= ${from}`);
      countQuery = countQuery.gte('created_at', from);
    }
    if (to) {
      console.log(`   Step 3b: Filter created_at <= ${to}`);
      countQuery = countQuery.lte('created_at', to);
    }

    // Execute count query
    console.log(`   Executing count query...`);
    const { count, error: countError } = await countQuery;
    
    if (countError) {
      console.warn(`⚠️ Count query error: ${countError.message}`);
      console.warn(`   Error details:`, countError);
    }
    console.log(`   Total count with filters: ${count || 0}`);

    // Now build query for paginated data
    let dataQuery = supabaseClient
      .from('leads')
      .select('*')
      .eq('client_id', clientId);

    // Apply search filter
    if (q && q.trim()) {
      const searchTerm = q.trim();
      dataQuery = dataQuery.or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,company.ilike.%${searchTerm}%`);
    }

    // Apply date range filters
    if (from) {
      dataQuery = dataQuery.gte('created_at', from);
    }
    if (to) {
      dataQuery = dataQuery.lte('created_at', to);
    }

    // Apply sorting
    const [sortField, sortOrder] = parseSortString(sort);
    if (sortField) {
      const ascending = sortOrder === 'asc';
      console.log(`   Step 4: Sort by ${sortField} ${sortOrder}`);
      dataQuery = dataQuery.order(sortField, { ascending });
    }

    // Step 5: Apply pagination
    console.log(`   Step 5: Pagination range(${finalOffset}, ${finalOffset + finalLimit - 1})`);
    dataQuery = dataQuery.range(finalOffset, finalOffset + finalLimit - 1);

    // Execute query
    console.log(`   Executing data query...`);
    const { data, error } = await dataQuery;

    if (error) {
      console.error('❌ Query execution error:', error);
      console.error('   Error code:', error.code);
      console.error('   Error message:', error.message);
      console.error('   Error details:', error.details);
      throw new Error(`Failed to fetch leads: ${error.message}`);
    }

    console.log(`✅ Query succeeded: Retrieved ${data?.length || 0} leads (total count: ${count || 0})`);

    return {
      items: data || [],
      total: count || 0,
      limit: finalLimit,
      offset: finalOffset
    };
  } catch (error) {
    console.error('❌ getLeads error:', error.message);
    throw error;
  }
}

/**
 * Get leads across all clients (admin only)
 * 
 * @param {Object} supabaseClient - Supabase client
 * @param {Object} filters - Filter options {
 *   clientId: number (optional, filter by specific client),
 *   q: string (search name/email/company),
 *   from: ISO string,
 *   to: ISO string,
 *   limit: number,
 *   offset: number,
 *   sort: string
 * }
 * @returns {Object} { items: Lead[], total: number, limit, offset }
 */
export async function getLeadsAdmin(supabaseClient, filters = {}) {
  try {
    const {
      clientId,
      q,
      from,
      to,
      limit = 50,
      offset = 0,
      sort = 'created_at'
    } = filters;

    const finalLimit = Math.min(Math.max(1, limit), 100);
    const finalOffset = Math.max(0, offset);

    console.log(`👨‍💼 Admin fetching leads with filters:`, filters);

    // First, build a base query for count
    let countQuery = supabaseClient
      .from('leads')
      .select('id', { count: 'exact', head: true });

    // Filter by specific client if provided
    if (clientId) {
      countQuery = countQuery.eq('client_id', clientId);
    }

    // Apply search filter
    if (q && q.trim()) {
      const searchTerm = q.trim();
      countQuery = countQuery.or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,company.ilike.%${searchTerm}%`);
    }

    // Apply date range
    if (from) {
      countQuery = countQuery.gte('created_at', from);
    }
    if (to) {
      countQuery = countQuery.lte('created_at', to);
    }

    // Execute count query
    console.log(`   Fetching total count...`);
    const { count, error: countError } = await countQuery;
    
    if (countError) {
      console.warn(`⚠️ Count query error: ${countError.message}`);
      console.warn(`   Error details:`, countError);
    }
    console.log(`   Total count: ${count || 0}`);

    // Now build query for data with pagination
    let dataQuery = supabaseClient
      .from('leads')
      .select('*');

    // Filter by specific client if provided
    if (clientId) {
      dataQuery = dataQuery.eq('client_id', clientId);
    }

    // Apply search filter
    if (q && q.trim()) {
      const searchTerm = q.trim();
      dataQuery = dataQuery.or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,company.ilike.%${searchTerm}%`);
    }

    // Apply date range
    if (from) {
      dataQuery = dataQuery.gte('created_at', from);
    }
    if (to) {
      dataQuery = dataQuery.lte('created_at', to);
    }

    // Apply sorting
    const [sortField, sortOrder] = parseSortString(sort);
    if (sortField) {
      dataQuery = dataQuery.order(sortField, { ascending: sortOrder === 'asc' });
    }

    // Apply pagination
    console.log(`   Fetching data with pagination: offset=${finalOffset}, limit=${finalLimit}`);
    dataQuery = dataQuery.range(finalOffset, finalOffset + finalLimit - 1);

    const { data, error } = await dataQuery;

    if (error) {
      console.error('❌ Admin get leads error:', error);
      console.error('   Error code:', error.code);
      console.error('   Error message:', error.message);
      throw new Error(`Failed to fetch leads: ${error.message}`);
    }

    console.log(`✅ Admin retrieved ${data?.length || 0} leads (total: ${count || 0})`);

    return {
      items: data || [],
      total: count || 0,
      limit: finalLimit,
      offset: finalOffset
    };
  } catch (error) {
    console.error('❌ getLeadsAdmin error:', error);
    throw error;
  }
}

/**
 * Update conversation_id for an existing lead
 * Only updates if conversation_id is currently NULL (idempotent)
 * 
 * @param {Object} supabaseClient - Supabase client
 * @param {number} leadId - Lead ID
 * @param {number} conversationId - Conversation ID to link
 * @returns {Object} Updated lead or null
 */
export async function linkConversationToLead(supabaseClient, leadId, conversationId) {
  try {
    console.log(`🔗 Linking conversation ${conversationId} to lead ${leadId}`);

    const { data, error } = await supabaseClient
      .from('leads')
      .update({
        conversation_id: conversationId
      })
      .eq('id', leadId)
      .select()
      .single();

    if (error) {
      console.error('❌ Link conversation error:', error);
      throw error;
    }

    console.log(`✅ Lead linked to conversation ${conversationId}`);
    return data;
  } catch (error) {
    console.error('❌ linkConversationToLead error:', error);
    throw error;
  }
}

/**
 * Update lead status
 * @param {Object} supabaseClient - Supabase client
 * @param {string|number} leadId - Lead ID
 * @param {string} status - New status (new, contacted, qualified, won, lost)
 * @returns {Object} Updated lead
 */
export async function updateLeadStatus(supabaseClient, leadId, status) {
  // Validate status
  const validStatuses = ['new', 'contacted', 'qualified', 'won', 'lost'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  try {
    console.log(`📝 Updating lead ${leadId} status to: ${status}`);

    const { data, error } = await supabaseClient
      .from('leads')
      .update({ status })
      .eq('id', leadId)
      .select()
      .single();

    if (error) {
      console.error('❌ updateLeadStatus database error:', error);
      throw error;
    }

    if (!data) {
      throw new Error('Lead not found');
    }

    console.log(`✅ Lead ${leadId} status updated to: ${status}`);
    return data;
  } catch (error) {
    console.error('❌ updateLeadStatus error:', error);
    throw error;
  }
}

/**
 * Helper: Parse sort string like "created_at desc" or "email asc"
 * @param {string} sortString - Sort string
 * @returns {Array} [field, order] or [null, null] if invalid
 */
function parseSortString(sortString) {
  if (!sortString) return [null, null];

  const parts = sortString.trim().split(/\s+/);
  const field = parts[0];
  const order = parts[1]?.toLowerCase() === 'asc' ? 'asc' : 'desc';

  // Whitelist allowed fields
  const allowedFields = ['id', 'client_id', 'visitor_id', 'name', 'email', 'phone', 'company', 'created_at', 'updated_at', 'conversation_id', 'status'];

  if (allowedFields.includes(field)) {
    return [field, order];
  }

  return [null, null];
}
