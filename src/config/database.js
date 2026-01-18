import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // ← Service key

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Test connection
supabase
  .from('clients')
  .select('count')
  .limit(1)
  .then(() => console.log('✅ Supabase connected'))
  .catch(err => console.error('❌ Supabase connection failed:', err.message));

export default supabase;
