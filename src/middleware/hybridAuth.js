// Hybrid authentication middleware - accepts both API key and dashboard auth
// Used for chat routes that need to support both widget (API key) and dashboard (Bearer token) users

export const hybridAuthMiddleware = async (req, res, next) => {
  try {
    const bearerToken = req.headers.authorization?.split(' ')[1];
    const apiKey = req.headers['x-api-key'];

    // ✅ Try bearer token first (dashboard auth)
    if (bearerToken) {
      console.log(`🔐 Attempting dashboard auth (Bearer token)`);
      
      try {
        const supabase = (await import('../config/database.js')).default;
        
        // Verify the token with Supabase auth
        const { data: { user }, error: authError } = await supabase.auth.getUser(bearerToken);
        
        if (authError || !user) {
          console.log('❌ Invalid or expired Bearer token');
          return res.status(401).json({
            error: 'Invalid or expired Bearer token'
          });
        }

        // Fetch dashboard user details
        const { data: dashboardUser, error: userError } = await supabase
          .from('dashboard_users')
          .select('user_id, client_id, role')
          .eq('user_id', user.id)
          .single();

        if (userError || !dashboardUser) {
          console.log('❌ Dashboard user not found');
          return res.status(401).json({
            error: 'Dashboard user not found'
          });
        }

        console.log(`✅ Dashboard auth validated: role=${dashboardUser.role}, client_id=${dashboardUser.client_id}`);

        // Set dashboard user info for role-based access control
        req.dashboardUser = dashboardUser;
        req.user = user;
        req.authType = 'bearer-token';
        req.supabaseClient = supabase;

        return next();
      } catch (error) {
        console.error('❌ Bearer token validation error:', error.message);
        return res.status(401).json({
          error: 'Invalid Bearer token'
        });
      }
    }

    // ✅ Fall back to API key (widget auth)
    if (apiKey) {
      console.log(`🔐 Attempting API key auth`);
      
      const supabase = (await import('../config/database.js')).default;
      
      const { data: client, error } = await supabase
        .from('clients')
        .select('id, company_name, api_key, website_url')
        .eq('api_key', apiKey)
        .single();

      if (error || !client) {
        console.log('❌ Invalid API key');
        return res.status(401).json({
          error: 'Invalid API key'
        });
      }

      console.log(`✅ API Key validated for client: ${client.company_name} (ID: ${client.id})`);

      // Set clientId for API key auth
      req.clientId = client.id;
      req.clientName = client.company_name;
      req.authType = 'api-key';
      req.supabaseClient = supabase;

      return next();
    }

    // ❌ No auth method provided
    console.log('❌ No authentication provided');
    return res.status(401).json({
      error: 'Authentication required: provide X-API-Key header or Authorization Bearer token'
    });

  } catch (error) {
    console.error('❌ Hybrid auth middleware error:', error);
    res.status(500).json({
      error: 'Authentication failed'
    });
  }
};
