import supabase from '../config/database.js';

/**
 * Service: Dashboard Users Management
 * Handles CRUD operations for dashboard_users table
 */

/**
 * Get client_id from company_name
 * @param {string} company_name - Name of the company
 * @returns {Promise<number|null>} - client_id or null if not found
 */
export const getClientIdByCompanyName = async (company_name) => {
  try {
    const { data: client, error } = await supabase
      .from('clients')
      .select('id')
      .eq('company_name', company_name)
      .single();

    if (error) {
      console.error(`❌ Error finding client by name "${company_name}":`, error);
      return null;
    }

    return client?.id || null;
  } catch (error) {
    console.error('❌ Error in getClientIdByCompanyName:', error);
    return null;
  }
};

/**
 * Validate that role is one of the allowed values
 * @param {string} role - Role to validate
 * @returns {boolean} - true if valid, false otherwise
 */
const isValidRole = (role) => {
  const validRoles = ['super_admin', 'client'];
  return validRoles.includes(role);
};

/**
 * Add a new dashboard user
 * Enforces one-to-one relationship: one client can only have one user
 * @param {Object} userData - { user_id, client_id, role, user_name, phone_number }
 * @returns {Promise<Object|null>} - Created user object or null on error
 */
export const addDashboardUser = async (userData) => {
  try {
    const { user_id, client_id, role, user_name, phone_number } = userData;

    // Validation
    if (!user_id || !client_id || !role || !user_name) {
      throw new Error('Missing required fields: user_id, client_id, role, user_name');
    }

    // Validate role
    if (!isValidRole(role)) {
      throw new Error('Invalid role. Allowed roles: super_admin, client');
    }

    // Check if client already has a user (enforce one-to-one relationship)
    const { data: existingUser, error: checkError } = await supabase
      .from('dashboard_users')
      .select('user_id')
      .eq('client_id', client_id)
      .single();

    // If query returns no rows, that's okay (error will indicate no match)
    // If query returns a user, we have a conflict
    if (existingUser) {
      throw new Error(`Client ${client_id} already has a user assigned. One client can only have one user.`);
    }

    console.log(`\n📝 Adding dashboard user: ${user_name} (${user_id})`);

    const { data: user, error } = await supabase
      .from('dashboard_users')
      .insert({
        user_id,
        client_id,
        role,
        user_name,
        phone_number: phone_number || null,
        status: 'active',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error adding dashboard user:', error);
      return null;
    }

    console.log(`✅ Dashboard user added successfully (ID: ${user.user_id})`);
    return user;

  } catch (error) {
    console.error('❌ Error in addDashboardUser:', error.message);
    return null;
  }
};

/**
 * Get a dashboard user by user_id
 * @param {string} user_id - User ID (UUID)
 * @returns {Promise<Object|null>} - User object or null if not found
 */
export const getDashboardUser = async (user_id) => {
  try {
    const { data: user, error } = await supabase
      .from('dashboard_users')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (error) {
      console.error(`❌ Error fetching dashboard user ${user_id}:`, error);
      return null;
    }

    return user || null;

  } catch (error) {
    console.error('❌ Error in getDashboardUser:', error.message);
    return null;
  }
};

/**
 * Get dashboard user by client_id
 * Since relationship is one-to-one, returns a single user or null
 * @param {number} client_id - Client ID
 * @returns {Promise<Object|null>} - User object or null if not found
 */
export const getDashboardUserByClient = async (client_id) => {
  try {
    const { data: user, error } = await supabase
      .from('dashboard_users')
      .select('*')
      .eq('client_id', client_id)
      .single();

    if (error) {
      // No user found for this client (this is expected if no user assigned)
      return null;
    }

    return user || null;

  } catch (error) {
    console.error('❌ Error in getDashboardUserByClient:', error.message);
    return null;
  }
};

/**
 * Get all dashboard users for a client
 * @deprecated Use getDashboardUserByClient() instead (one-to-one relationship)
 * @param {number} client_id - Client ID
 * @returns {Promise<Array>} - Array of users or empty array on error
 */
export const getDashboardUsersByClient = async (client_id) => {
  try {
    const { data: users, error } = await supabase
      .from('dashboard_users')
      .select('*')
      .eq('client_id', client_id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(`❌ Error fetching users for client ${client_id}:`, error);
      return [];
    }

    return users || [];

  } catch (error) {
    console.error('❌ Error in getDashboardUsersByClient:', error.message);
    return [];
  }
};

/**
 * Update a dashboard user
 * @param {string} user_id - User ID (UUID)
 * @param {Object} updates - Fields to update { role, user_name, phone_number }
 * @returns {Promise<Object|null>} - Updated user object or null on error
 */
export const updateDashboardUser = async (user_id, updates) => {
  try {
    if (!user_id) {
      throw new Error('user_id is required');
    }

    if (Object.keys(updates).length === 0) {
      throw new Error('No fields to update');
    }

    // Validate role if provided
    if (updates.role && !isValidRole(updates.role)) {
      throw new Error('Invalid role. Allowed roles: super_admin, client');
    }

    console.log(`\n📝 Updating dashboard user ${user_id}:`, updates);

    const { data: user, error } = await supabase
      .from('dashboard_users')
      .update(updates)
      .eq('user_id', user_id)
      .select()
      .single();

    if (error) {
      console.error('❌ Error updating dashboard user:', error);
      return null;
    }

    console.log(`✅ Dashboard user updated successfully (ID: ${user.user_id})`);
    return user;

  } catch (error) {
    console.error('❌ Error in updateDashboardUser:', error.message);
    return null;
  }
};

/**
 * Delete (soft delete) a dashboard user
 * @param {string} user_id - User ID (UUID)
 * @returns {Promise<boolean>} - true on success, false on error
 */
export const deleteDashboardUser = async (user_id) => {
  try {
    if (!user_id) {
      throw new Error('user_id is required');
    }

    console.log(`\n🗑️ Soft deleting dashboard user ${user_id}`);

    const { error } = await supabase
      .from('dashboard_users')
      .update({ status: 'inactive' })
      .eq('user_id', user_id);

    if (error) {
      console.error('❌ Error soft deleting dashboard user:', error);
      return false;
    }

    console.log(`✅ Dashboard user soft deleted successfully`);
    return true;

  } catch (error) {
    console.error('❌ Error in deleteDashboardUser:', error.message);
    return false;
  }
};

/**
 * Get users by status
 * @param {string} status - 'active' or 'inactive'
 * @returns {Promise<Array>} - Array of users or empty array on error
 */
export const getDashboardUsersByStatus = async (status = 'active') => {
  try {
    const { data: users, error } = await supabase
      .from('dashboard_users')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(`❌ Error fetching ${status} users:`, error);
      return [];
    }

    return users || [];

  } catch (error) {
    console.error('❌ Error in getDashboardUsersByStatus:', error.message);
    return [];
  }
};

/**
 * Get clients by status
 * @param {string} status - 'active' or 'inactive'
 * @returns {Promise<Array>} - Array of clients or empty array on error
 */
export const getClientsByStatus = async (status = 'active') => {
  try {
    const { data: clients, error } = await supabase
      .from('clients')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(`❌ Error fetching ${status} clients:`, error);
      return [];
    }

    return clients || [];

  } catch (error) {
    console.error('❌ Error in getClientsByStatus:', error.message);
    return [];
  }
};

export default {
  getClientIdByCompanyName,
  addDashboardUser,
  getDashboardUser,
  getDashboardUsersByClient,
  updateDashboardUser,
  deleteDashboardUser
};
