import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Strict Singleton Pattern for Next.js Serverless/HMR environments
const globalForSupabase = globalThis;

export const supabase =
  globalForSupabase.supabaseClient ||
  createClient(supabaseUrl, supabaseAnonKey);

if (process.env.NODE_ENV !== 'production') {
  globalForSupabase.supabaseClient = supabase;
}

// Export a singleton for Admin/Service Role actions as well
export const adminSupabase =
  globalForSupabase.adminSupabaseClient ||
  (supabaseServiceKey 
    ? createClient(supabaseUrl, supabaseServiceKey) 
    : null);

if (process.env.NODE_ENV !== 'production' && adminSupabase) {
  globalForSupabase.adminSupabaseClient = adminSupabase;
}
