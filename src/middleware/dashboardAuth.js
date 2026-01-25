import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
}

/**
 * Middleware: Verify Bearer token via Supabase Auth
 * ✅ CRITICAL: Validates token with Supabase Auth on every request
 * Creates per-request Supabase client with user's token (for RLS enforcement)
 * Attaches req.user ({ id: uuid }) and req.token
 * 
 * 401: Missing, invalid, or expired token
 * 500: Server error
 */
export const requireDashboardAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ Missing or malformed Authorization header');
      return res.status(401).json({
        error: 'Missing or invalid authorization token'
      });
    }

    const token = authHeader.slice(7); // Remove "Bearer " prefix

    // Create a temporary Supabase client with the user's token to validate it
    const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });

    // ✅ VALIDATE token with Supabase Auth
    // This checks: token format, signature, expiration, and user existence
    const { data: { user }, error: authError } = await tempClient.auth.getUser(token);

    if (authError || !user) {
      console.log(`❌ Token validation failed: ${authError?.message || 'Invalid token'}`);
      return res.status(401).json({
        error: 'Invalid or expired authorization token'
      });
    }

    console.log(`✅ Token validated with Supabase Auth for user: ${user.id}`);

    // Attach user and token to request
    req.user = {
      id: user.id
    };
    req.token = token;

    // Create per-request Supabase client with the user's token
    // This ensures all subsequent DB queries run as that user (RLS applies)
    req.supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });

    console.log(`✅ Dashboard auth middleware passed for user: ${req.user.id}`);
    next();

  } catch (error) {
    console.error('❌ Dashboard auth middleware error:', error.message);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
};

/**
 * Middleware: Check dashboard user exists with required role
 * Must be called AFTER requireDashboardAuth
 * 
 * 403: Authenticated but no dashboard_users row or wrong role
 */
export const requireDashboardRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.supabaseClient) {
        return res.status(401).json({
          error: 'Authentication required'
        });
      }

      // Query dashboard_users with RLS applied (user can only see their own row)
      const { data: dashboardUser, error } = await req.supabaseClient
        .from('dashboard_users')
        .select('role, client_id')
        .eq('user_id', req.user.id)
        .single();

      if (error || !dashboardUser) {
        console.log(`❌ No dashboard access for user: ${req.user.id}`);
        return res.status(403).json({
          error: 'No dashboard access'
        });
      }

      const { role, client_id } = dashboardUser;

      if (!allowedRoles.includes(role)) {
        console.log(`❌ User ${req.user.id} has role '${role}', requires one of: ${allowedRoles.join(', ')}`);
        return res.status(403).json({
          error: 'Insufficient permissions'
        });
      }

      // Attach dashboard user info to request for downstream use
      req.dashboardUser = {
        role,
        client_id
      };

      console.log(`✅ Role check passed for user: ${req.user.id}, role: ${role}`);
      next();

    } catch (error) {
      console.error('❌ Role check middleware error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  };
};
