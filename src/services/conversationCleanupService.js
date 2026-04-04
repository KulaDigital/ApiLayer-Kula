// Auto-close service for inactive conversations
import supabase from '../config/database.js';

// ============================================
// Configuration Constants
// ============================================

const CONFIG = {
  // Hours after which active conversations should be closed (24 hours)
  INACTIVITY_HOURS: parseInt(process.env.CONVERSATION_INACTIVITY_HOURS || '24', 10),
  
  // Interval in milliseconds to run the cleanup (15 minutes)
  CLEANUP_INTERVAL_MS: parseInt(process.env.CONVERSATION_CLEANUP_INTERVAL || '900000', 10),
  
  // Run immediately when server starts
  RUN_ON_STARTUP: true,
  
  // Log results only if > 0 conversations were closed
  LOG_ONLY_IF_CLOSED: true
};

// ============================================
// State Management
// ============================================

let cleanupInterval = null;

// ============================================
// Main Auto-Close Function
// ============================================

/**
 * Close inactive conversations that meet the criteria:
 * - status = 'active'
 * - last_message_at is older than INACTIVITY_HOURS
 *
 * @returns {Object} { success: boolean, closedCount: number, error?: string }
 */
async function closeInactiveConversations() {
  try {
    // Calculate the threshold date
    const inactivityMs = CONFIG.INACTIVITY_HOURS * 60 * 60 * 1000;
    const thresholdDate = new Date(Date.now() - inactivityMs).toISOString();

    // Fetch all conversations that should be closed
    const { data: inactiveConversations, error: selectError } = await supabase
      .from('conversations')
      .select('id, client_id, visitor_id, last_message_at')
      .eq('status', 'active')
      .lt('last_message_at', thresholdDate)
      .limit(1000); // Safety limit to avoid massive updates

    if (selectError) {
      throw new Error(`Failed to fetch inactive conversations: ${selectError.message}`);
    }

    const conversationIds = inactiveConversations?.map(c => c.id) || [];

    // If no conversations to close, return early
    if (conversationIds.length === 0) {
      if (!CONFIG.LOG_ONLY_IF_CLOSED) {
        console.log('⏰ Conversation cleanup: No inactive conversations found');
      }
      return { success: true, closedCount: 0 };
    }

    // Update all inactive conversations to 'closed' status
    const { error: updateError } = await supabase
      .from('conversations')
      .update({ status: 'closed' })
      .in('id', conversationIds);

    if (updateError) {
      throw new Error(`Failed to close conversations: ${updateError.message}`);
    }

    // Log only if conversations were closed
    console.log(
      `✅ Conversation cleanup: Closed ${conversationIds.length} inactive conversation(s) ` +
      `(inactive for ${CONFIG.INACTIVITY_HOURS}+ hours)`
    );

    return { success: true, closedCount: conversationIds.length };

  } catch (error) {
    console.error('❌ Conversation cleanup failed:', error.message);
    // Return error but don't crash the app
    return { success: false, closedCount: 0, error: error.message };
  }
}

// ============================================
// Interval Setup
// ============================================

/**
 * Initialize the conversation cleanup service
 * - Runs once immediately if RUN_ON_STARTUP is true
 * - Sets up recurring interval
 * - Returns cleanup management functions
 */
function initializeCleanupService() {
  console.log(`\n⏰ Initializing conversation cleanup service...`);
  console.log(`   • Inactivity threshold: ${CONFIG.INACTIVITY_HOURS} hours`);
  console.log(`   • Cleanup interval: ${CONFIG.CLEANUP_INTERVAL_MS / 1000 / 60} minutes`);

  // Run once immediately on startup
  if (CONFIG.RUN_ON_STARTUP) {
    closeInactiveConversations().catch(err => {
      console.error('❌ Initial cleanup run failed:', err.message);
    });
  }

  // Set up recurring cleanup
  cleanupInterval = setInterval(async () => {
    await closeInactiveConversations();
  }, CONFIG.CLEANUP_INTERVAL_MS);

  console.log('✅ Conversation cleanup service started\n');

  return {
    closeNow: closeInactiveConversations,
    stop: stopCleanupService,
    getStatus: getCleanupStatus
  };
}

/**
 * Stop the cleanup interval and clear the timeout
 */
function stopCleanupService() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('⏹️ Conversation cleanup service stopped');
  }
}

/**
 * Get the current status of the cleanup service
 *
 * @returns {Object} { isRunning: boolean, interval: number, inactivityHours: number }
 */
function getCleanupStatus() {
  return {
    isRunning: cleanupInterval !== null,
    intervalMs: CONFIG.CLEANUP_INTERVAL_MS,
    inactivityHours: CONFIG.INACTIVITY_HOURS,
    nextCleanupMinutes: cleanupInterval ? Math.ceil(CONFIG.CLEANUP_INTERVAL_MS / 1000 / 60) : null
  };
}

// ============================================
// Graceful Shutdown Handlers
// ============================================

/**
 * Setup graceful shutdown handlers for SIGTERM and SIGINT signals
 * Ensures cleanup interval is cleared when the process terminates
 */
function setupGracefulShutdown() {
  const signals = ['SIGTERM', 'SIGINT'];

  signals.forEach(signal => {
    process.on(signal, () => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      stopCleanupService();
      process.exit(0);
    });
  });
}

// ============================================
// Exports
// ============================================

export {
  closeInactiveConversations,
  initializeCleanupService,
  stopCleanupService,
  getCleanupStatus,
  setupGracefulShutdown,
  CONFIG
};
