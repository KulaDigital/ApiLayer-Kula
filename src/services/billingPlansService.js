import supabase from '../config/database.js';

/**
 * Fetch all active billing plans
 * Returns billing plans ordered by creation date
 */
export async function getAllBillingPlans() {
  try {
    const { data, error } = await supabase
      .from('billing_plans')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching billing plans:', error);
    throw error;
  }
}

/**
 * Fetch a specific billing plan by code
 */
export async function getBillingPlanByCode(code) {
  try {
    const { data, error } = await supabase
      .from('billing_plans')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .single();

    if (error && error.code === 'PGRST116') {
      // No rows returned
      return null;
    }
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching billing plan:', error);
    throw error;
  }
}

/**
 * Format billing plan response with parsed JSON fields
 */
export function formatBillingPlanResponse(plan) {
  if (!plan) return null;

  return {
    idx: plan.idx,
    code: plan.code,
    display_name: plan.display_name,
    is_active: plan.is_active,
    prices: typeof plan.prices === 'string' ? JSON.parse(plan.prices) : plan.prices,
    limits: typeof plan.limits === 'string' ? JSON.parse(plan.limits) : plan.limits,
    entitlements: typeof plan.entitlements === 'string' ? JSON.parse(plan.entitlements) : plan.entitlements,
    created_at: plan.created_at,
    updated_at: plan.updated_at
  };
}

/**
 * Format multiple billing plans with parsed JSON fields
 */
export function formatBillingPlansResponse(plans) {
  return plans.map(plan => formatBillingPlanResponse(plan));
}
