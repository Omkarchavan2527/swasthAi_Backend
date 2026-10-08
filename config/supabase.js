const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://xyzcompany.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhY...demo';

const isConfigured = Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY));

let supabase = null;
if (isConfigured) {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('✅ Connected to Supabase Cloud PostgreSQL Database & Storage!');
} else {
  console.log('ℹ️ SUPABASE_URL not configured yet. Server operating with Supabase fallback mode.');
}

module.exports = {
  supabase,
  isConfigured,
  supabaseUrl
};
