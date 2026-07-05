import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const createOrGetClient = () => {
  if (typeof window === 'undefined') {
    return createClient(supabaseUrl, supabaseAnonKey);
  }
  if (!window.supabaseClientInstance) {
    window.supabaseClientInstance = createClient(supabaseUrl, supabaseAnonKey);
  }
  return window.supabaseClientInstance;
};

export const supabase = createOrGetClient();
