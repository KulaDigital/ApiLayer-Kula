// middleware/scraperAuth.js
/**
 * Scraper endpoints authentication middleware
 * Supports BOTH:
 * 1. Bearer token (Dashboard users - super_admin or client) - Recommended
 * 2. X-API-Key (Legacy widget/API key) - Still supported for backwards compatibility
 * 
 * ✅ NEW: Role-based access control
 * - super_admin: Can access any client's scraping details
 * - client: Can only access their own client's scraping details
 * - API key: Can access their associated client's scraping details
 * 
 * Priority: Bearer token > API key
 */

import { createClient } from '@supabase/supabase-js';
import supabase from '../config/database.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
}

/**
 * Middleware: Authenticate scraper endpoints with Bearer token OR API key
 * Supports role-based access (super_admin or client)
 * 
 * Supports:
 * - Bearer token (recommended for dashboard users with super_admin or client role)
 * - X-API-Key (legacy, for API key users)
 */
export const scraperAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'];

    // ============================================
    // TRY BEARER TOKEN FIRST (Priority 1)
    // ============================================
    if (authHeader && authHeader.startsWith('Bearer ')) {
      console.log(`🔐 Scraper Auth: Bearer token detected`);
      
      const token = authHeader.slice(7); // Remove "Bearer " prefix

      try {
        // Validate token with Supabase Auth
        const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
          global: {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        });

        const { data: { user }, error: userError } = await tempClient.auth.getUser();

        if (userError || !user) {
          console.log('❌ Invalid or expired Bearer token');
          return res.status(401).json({
            error: 'Invalid or expired authorization token'
          });
        }

        console.log(`✅ Bearer token validated for user: ${user.id}`);

        // ✅ NEW: Get user role and client_id from dashboard_users table
        const { data: dashboardUser, error: dashboardError } = await supabase
          .from('dashboard_users')
          .select('role, client_id')
          .eq('user_id', user.id)
          .single();

        if (dashboardError || !dashboardUser) {
          console.log('❌ User not found in dashboard_users table');
          return res.status(403).json({
            error: 'User not associated with dashboard access'
          });
        }

        const { role, client_id } = dashboardUser;

        // ✅ NEW: Check if user has allowed role (super_admin or client)
        if (!['super_admin', 'client'].includes(role)) {
          console.log(`❌ User ${user.id} has role '${role}', requires 'super_admin' or 'client'`);
          return res.status(403).json({
            error: 'Insufficient permissions to access scraper endpoints'
          });
        }

        console.log(`✅ Role check passed: user '${user.id}' has role '${role}'`);
        console.log(`✅ Client ID resolved: ${client_id}`);

        req.clientId = client_id;
        req.userId = user.id;
        req.userRole = role;
        req.authType = 'bearer';
        return next();
      } catch (error) {
        console.error('❌ Bearer token validation error:', error.message);
        return res.status(401).json({
          error: 'Token validation failed'
        });
      }
    }

    // ============================================
    // FALLBACK TO API KEY (Priority 2) - Legacy
    // ============================================
    if (apiKeyHeader) {
      console.log(`🔐 Scraper Auth: API key detected`);

      const { data: client, error } = await supabase
        .from('clients')
        .select('id, company_name, api_key')
        .eq('api_key', apiKeyHeader)
        .single();

      if (error || !client) {
        console.log('❌ Invalid or inactive API key');
        return res.status(401).json({
          success: false,
          error: 'Invalid or inactive API key'
        });
      }

      console.log(`✅ API key validated for client: ${client.company_name} (ID: ${client.id})`);

      req.clientId = client.id;
      req.clientName = client.company_name;
      req.authType = 'api_key';
      return next();
    }

    // ============================================
    // NO AUTHENTICATION PROVIDED
    // ============================================
    console.log('❌ No authentication provided (no Bearer token or API key)');
    return res.status(401).json({
      error: 'Authentication required. Provide Bearer token or X-API-Key header'
    });

  } catch (error) {
    console.error('❌ Scraper auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};
