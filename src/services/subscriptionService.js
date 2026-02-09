import supabase from '../config/database.js';

/**
 * Create a trial subscription for a client
 */
export async function createTrialSubscription(clientId, config = {}) {
  try {
    // Determine if this is a trial or paid subscription
    const isTrialConfig = config.is_trial !== false; // default to true
    
    let startedAt = new Date();
    let endsAt = new Date();
    let plan = config.plan || 'professional';
    let period = config.period || 'monthly';
    let status = 'active';

    if (isTrialConfig) {
      // Trial subscription: fixed 30 days
      const trialDays = config.trialDays || 30;
      endsAt.setDate(endsAt.getDate() + trialDays);
      plan = 'professional'; // Trial is always professional
      period = 'monthly'; // Trial is always monthly
    } else {
      // Paid subscription: set end date based on period
      if (period === 'yearly') {
        endsAt.setFullYear(endsAt.getFullYear() + 1);
      } else {
        endsAt.setMonth(endsAt.getMonth() + 1);
      }
    }

    const { data, error } = await supabase
      .from('client_subscriptions')
      .insert({
        client_id: clientId,
        status,
        plan,
        period,
        is_trial: isTrialConfig,
        started_at: startedAt.toISOString(),
        ends_at: endsAt.toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating trial subscription:', error);
    throw error;
  }
}

/**
 * Get subscription by client ID
 */
export async function getSubscriptionByClientId(clientId) {
  try {
    const { data, error } = await supabase
      .from('client_subscriptions')
      .select('*')
      .eq('client_id', clientId)
      .single();

    if (error && error.code === 'PGRST116') {
      // No rows returned
      return null;
    }
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting subscription:', error);
    throw error;
  }
}

/**
 * Insert or update subscription
 */
export async function upsertSubscription(clientId, subscriptionData) {
  try {
    const { data, error } = await supabase
      .from('client_subscriptions')
      .upsert(
        {
          client_id: clientId,
          ...subscriptionData,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'client_id' }
      )
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error upserting subscription:', error);
    throw error;
  }
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(clientId, cancelType = 'immediate') {
  try {
    let status = 'canceled';
    let canceledAt = new Date().toISOString();

    if (cancelType === 'end_of_period') {
      status = 'pending_cancellation';
    }

    const { data, error } = await supabase
      .from('client_subscriptions')
      .update({
        status,
        canceled_at: canceledAt,
        updated_at: new Date().toISOString()
      })
      .eq('client_id', clientId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error canceling subscription:', error);
    throw error;
  }
}

/**
 * Deactivate subscription
 */
export async function deactivateSubscription(clientId) {
  try {
    const { data, error } = await supabase
      .from('client_subscriptions')
      .update({
        status: 'inactive',
        updated_at: new Date().toISOString()
      })
      .eq('client_id', clientId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error deactivating subscription:', error);
    throw error;
  }
}

/**
 * Format subscription response
 */
export function formatSubscriptionResponse(subscription) {
  if (!subscription) return null;

  // Compute is_entitled: true if status is active AND subscription hasn't ended
  const now = new Date();
  const isEntitled = subscription.status === 'active' && 
                     subscription.ends_at && 
                     new Date(subscription.ends_at) > now;

  return {
    id: subscription.id,
    client_id: subscription.client_id,
    status: subscription.status,
    plan: subscription.plan,
    period: subscription.period,
    is_trial: subscription.is_trial || false,
    started_at: subscription.started_at,
    ends_at: subscription.ends_at,
    is_entitled: isEntitled,
    canceled_at: subscription.canceled_at,
    created_at: subscription.created_at,
    updated_at: subscription.updated_at
  };
}

/**
 * Handle subscription created event
 */
export async function handleSubscriptionCreated(clientId, subscriptionData) {
  try {
    const subscription = await upsertSubscription(clientId, {
      ...subscriptionData,
      status: 'active',
      created_at: new Date().toISOString()
    });

    console.log(`✅ Subscription created for client ${clientId}`);
    return subscription;
  } catch (error) {
    console.error('Error handling subscription created:', error);
    throw error;
  }
}

/**
 * Handle subscription canceled event
 */
export async function handleSubscriptionCanceled(clientId) {
  try {
    const subscription = await cancelSubscription(clientId, 'immediate');
    console.log(`✅ Subscription canceled for client ${clientId}`);
    return subscription;
  } catch (error) {
    console.error('Error handling subscription canceled:', error);
    throw error;
  }
}

/**
 * Run expiry job to check for subscription expirations
 */
export async function runExpiryJob() {
  try {
    const now = new Date().toISOString();

    // Get all active subscriptions that have expired
    const { data: expiredSubs, error: fetchError } = await supabase
      .from('client_subscriptions')
      .select('*')
      .eq('status', 'active')
      .lt('ends_at', now);

    if (fetchError) throw fetchError;

    if (expiredSubs && expiredSubs.length > 0) {
      // Update expired subscriptions to inactive
      const { error: updateError } = await supabase
        .from('client_subscriptions')
        .update({
          status: 'inactive',
          updated_at: new Date().toISOString()
        })
        .eq('status', 'active')
        .lt('ends_at', now);

      if (updateError) throw updateError;

      console.log(`✅ Expiry job: ${expiredSubs.length} subscriptions deactivated`);
    }

    return {
      success: true,
      deactivatedCount: expiredSubs?.length || 0
    };
  } catch (error) {
    console.error('Error running expiry job:', error);
    throw error;
  }
}
