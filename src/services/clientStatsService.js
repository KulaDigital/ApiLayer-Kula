import supabase from '../config/database.js';

/**
 * Service: Client Statistics and Usage Tracking
 * Handles queries for client usage metrics like message counts
 */

/**
 * Get total message count for a specific client across all conversations
 * @param {number} clientId - The client ID
 * @returns {Promise<object>} - Object with totalMessages and conversationCount
 */
export async function getClientMessageCount(clientId) {
  try {
    // Get total conversation count for the client
    const { count: conversationCount, error: convError } = await supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId);

    if (convError) throw convError;

    // Get message count by joining conversations and messages
    // This query gets all conversations for the client and counts their messages
    const { data: conversations, error: listError } = await supabase
      .from('conversations')
      .select('id')
      .eq('client_id', clientId);

    if (listError) throw listError;

    // If no conversations, return 0
    if (!conversations || conversations.length === 0) {
      return {
        client_id: clientId,
        total_messages: 0,
        conversation_count: 0,
        average_messages_per_conversation: 0
      };
    }

    // Get conversation IDs
    const conversationIds = conversations.map(c => c.id);

    // Query total messages count across all conversations
    const { count: totalMessages, error: msgError } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .in('conversation_id', conversationIds);

    if (msgError) throw msgError;

    const messageCount = totalMessages || 0;
    const convCount = conversationCount || 0;
    const avgMessagesPerConv = convCount > 0 ? Math.round((messageCount / convCount) * 100) / 100 : 0;

    return {
      client_id: clientId,
      total_messages: messageCount,
      conversation_count: convCount,
      average_messages_per_conversation: avgMessagesPerConv
    };
  } catch (error) {
    console.error('Error getting client message count:', error);
    throw error;
  }
}

/**
 * Get detailed message statistics for a client
 * Includes daily breakdown, message types, and timeline
 * @param {number} clientId - The client ID
 * @returns {Promise<object>} - Detailed message statistics
 */
export async function getClientMessageStats(clientId) {
  try {
    const stats = await getClientMessageCount(clientId);

    // Get date range of messages
    const { data: dateRange, error: dateError } = await supabase
      .from('conversations')
      .select('created_at, last_message_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true })
      .limit(1);

    if (dateError) throw dateError;

    const firstConversationDate = dateRange?.[0]?.created_at || null;
    const { data: lastConv, error: lastError } = await supabase
      .from('conversations')
      .select('last_message_at')
      .eq('client_id', clientId)
      .order('last_message_at', { ascending: false })
      .limit(1);

    if (lastError) throw lastError;

    const lastMessageDate = lastConv?.[0]?.last_message_at || null;

    return {
      client_id: clientId,
      total_messages: stats.total_messages,
      conversation_count: stats.conversation_count,
      average_messages_per_conversation: stats.average_messages_per_conversation,
      message_timeline: {
        first_message_at: firstConversationDate,
        last_message_at: lastMessageDate
      }
    };
  } catch (error) {
    console.error('Error getting client message stats:', error);
    throw error;
  }
}
