import express from 'express';
import {
  getAllBillingPlans,
  getBillingPlanByCode,
  formatBillingPlansResponse,
  formatBillingPlanResponse
} from '../services/billingPlansService.js';

const router = express.Router();

/**
 * GET /api/billing/plans
 * Public Endpoint: No authentication required
 * 
 * Returns all active billing plans with complete details
 * Response: Array of billing plan objects
 * [
 *   {
 *     "idx": 0,
 *     "code": "business",
 *     "display_name": "Business",
 *     "is_active": true,
 *     "prices": {
 *       "yearly": 199990,
 *       "monthly": 19999,
 *       "currency": "INR"
 *     },
 *     "limits": {
 *       "messages_per_month": 7500,
 *       "overage_per_conversation_inr": 2.5
 *     },
 *     "entitlements": {
 *       "seats": 15,
 *       "channels": ["web", "whatsapp", "custom"],
 *       "features": {...},
 *       "chatbot_count": 1,
 *       "support_channel": "phone",
 *       "support_sla_hours": 12
 *     },
 *     "created_at": "2026-03-22T17:31:17.942353+00:00",
 *     "updated_at": "2026-03-22T17:31:17.942353+00:00"
 *   },
 *   ...
 * ]
 * 
 * Status Codes:
 * - 200: Successfully retrieved all billing plans
 * - 500: Server error
 */
router.get('/plans', async (req, res) => {
  try {
    const plans = await getAllBillingPlans();
    const formattedPlans = formatBillingPlansResponse(plans);
    
    console.log(`✅ GET /api/billing/plans: Retrieved ${formattedPlans.length} billing plans`);
    
    res.json(formattedPlans);
  } catch (error) {
    console.error('❌ GET /api/billing/plans error:', error);
    res.status(500).json({
      error: 'Failed to retrieve billing plans'
    });
  }
});

/**
 * GET /api/billing/plans/:code
 * Public Endpoint: No authentication required
 * 
 * Returns a specific billing plan by code
 * Parameters:
 * - code: Plan code (e.g., "business", "professional", "starter", "trial")
 * 
 * Response: Single billing plan object
 * {
 *   "idx": 0,
 *   "code": "business",
 *   "display_name": "Business",
 *   "is_active": true,
 *   "prices": {...},
 *   "limits": {...},
 *   "entitlements": {...},
 *   "created_at": "2026-03-22T17:31:17.942353+00:00",
 *   "updated_at": "2026-03-22T17:31:17.942353+00:00"
 * }
 * 
 * Status Codes:
 * - 200: Successfully retrieved the billing plan
 * - 404: Plan not found
 * - 500: Server error
 */
router.get('/plans/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    if (!code) {
      return res.status(400).json({
        error: 'Plan code is required'
      });
    }

    const plan = await getBillingPlanByCode(code);
    
    if (!plan) {
      return res.status(404).json({
        error: `Billing plan '${code}' not found`
      });
    }

    const formattedPlan = formatBillingPlanResponse(plan);
    
    console.log(`✅ GET /api/billing/plans/${code}: Retrieved billing plan`);
    
    res.json(formattedPlan);
  } catch (error) {
    console.error(`❌ GET /api/billing/plans/${req.params.code} error:`, error);
    res.status(500).json({
      error: 'Failed to retrieve billing plan'
    });
  }
});

export default router;
