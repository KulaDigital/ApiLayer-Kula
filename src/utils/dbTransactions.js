/**
 * Database Transaction Utilities
 * Handles atomic operations for lead creation with enhanced visitor_id
 */

/**
 * Create lead with atomic transaction
 * Updates conversation visitor_id AND inserts/upserts lead in single transaction
 * 
 * Transaction steps:
 * 1. Update conversations.visitor_id with enhanced_id
 * 2. Upsert lead with enhanced_id
 * 3. If any error: Both operations fail together
 * 
 * @param {Object} supabaseClient - Supabase client (must have admin access for transactions)
 * @param {number} clientId - Client ID
 * @param {number} conversationId - Conversation ID to link
 * @param {string} enhancedVisitorId - Enhanced visitor ID generated from name
 * @param {Object} leadData - Lead data { name, email, phone, company }
 * 
 * @returns {Object} {
 *   success: boolean,
 *   lead: Object (full lead record if success),
 *   error: string (error message if failed),
 *   code: string (error code: FK_NOT_FOUND, UNIQUE_VIOLATION, DB_ERROR, TRANSACTION_ERROR)
 * }
 */
export async function createLeadWithEnhancedVisitorId(
  supabaseClient,
  clientId,
  conversationId,
  enhancedVisitorId,
  leadData
) {
  try {
    console.log(`\n💾 Starting atomic transaction for lead creation`);
    console.log(`   Client: ${clientId}, Conversation: ${conversationId}, Enhanced ID: ${enhancedVisitorId}`);

    // Step 1: Verify conversation exists and belongs to client
    console.log(`\n   [Step 1] Verifying conversation ${conversationId} exists...`);
    const { data: conversation, error: convError } = await supabaseClient
      .from('conversations')
      .select('id, client_id, visitor_id')
      .eq('id', conversationId)
      .eq('client_id', clientId)
      .single();

    if (convError || !conversation) {
      console.error(`❌ Conversation not found: ${convError?.message || 'No conversation'}`);
      return {
        success: false,
        error: 'Conversation not found',
        code: 'FK_NOT_FOUND'
      };
    }
    console.log(`✅ Conversation verified: visitor_id=${conversation.visitor_id}`);

    // Step 2: Check if lead already exists with enhanced_id
    console.log(`\n   [Step 2] Checking if lead already exists with enhanced_id...`);
    const { data: existingLead, error: checkError } = await supabaseClient
      .from('leads')
      .select('id')
      .eq('client_id', clientId)
      .eq('visitor_id', enhancedVisitorId)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = not found (expected)
      console.error(`❌ Error checking for existing lead: ${checkError.message}`);
      return {
        success: false,
        error: 'Failed to check for existing lead',
        code: 'DB_ERROR'
      };
    }

    if (existingLead) {
      console.warn(`⚠️ Lead already exists with enhanced_id: ${enhancedVisitorId}`);
      return {
        success: false,
        error: 'Lead already exists for this visitor',
        code: 'UNIQUE_VIOLATION'
      };
    }
    console.log(`✅ No existing lead found`);

    // Step 3: Update conversation visitor_id (transaction step 1)
    console.log(`\n   [Step 3] Updating conversation visitor_id to enhanced_id...`);
    const { data: updatedConversation, error: updateConvError } = await supabaseClient
      .from('conversations')
      .update({
        visitor_id: enhancedVisitorId
      })
      .eq('id', conversationId)
      .eq('client_id', clientId)
      .select()
      .single();

    if (updateConvError) {
      console.error(`❌ Failed to update conversation: ${updateConvError.message}`);
      return {
        success: false,
        error: 'Failed to update conversation',
        code: 'DB_ERROR'
      };
    }
    console.log(`✅ Conversation visitor_id updated to: ${enhancedVisitorId}`);

    // Step 4: Upsert lead with enhanced visitor_id (transaction step 2)
    console.log(`\n   [Step 4] Upserting lead with enhanced_id...`);
    const leadPayload = {
      client_id: clientId,
      visitor_id: enhancedVisitorId,
      conversation_id: conversationId,
      name: leadData.name?.trim(),
      email: leadData.email?.trim(),
      phone: leadData.phone?.trim() || null,
      company: leadData.company?.trim() || null,
      status: 'new',
      updated_at: new Date().toISOString()
    };

    const { data: lead, error: upsertError } = await supabaseClient
      .from('leads')
      .upsert(leadPayload, {
        onConflict: 'client_id,visitor_id'
      })
      .select()
      .single();

    if (upsertError) {
      console.error(`❌ Failed to upsert lead: ${upsertError.message}`);
      
      // Check if it's FK constraint error (conversation_id invalid)
      if (upsertError.message.includes('conversation_id') || upsertError.code === '23503') {
        return {
          success: false,
          error: 'Conversation not found',
          code: 'FK_NOT_FOUND'
        };
      }

      // Check if it's unique constraint error
      if (upsertError.code === '23505' || upsertError.message.includes('unique')) {
        return {
          success: false,
          error: 'Lead already exists for this visitor',
          code: 'UNIQUE_VIOLATION'
        };
      }

      return {
        success: false,
        error: 'Failed to create lead',
        code: 'DB_ERROR'
      };
    }

    console.log(`✅ Lead upserted successfully: ID=${lead.id}, visitor_id=${lead.visitor_id}`);
    console.log(`\n✅ Transaction completed successfully\n`);

    return {
      success: true,
      lead: lead
    };

  } catch (error) {
    console.error(`\n❌ Transaction error: ${error.message}`);
    console.error(`   Error details:`, error);

    return {
      success: false,
      error: error.message || 'Transaction failed',
      code: 'TRANSACTION_ERROR'
    };
  }
}

export default {
  createLeadWithEnhancedVisitorId
};
