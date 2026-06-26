import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const HARDCODED_URL = 'https://iclmspgiukqulsfukvwy.supabase.co';
const HARDCODED_KEY = 'sb_publishable_lWg7AuVXc6gy4-Uo7IdYOw_0akpf_cx';

export const SUPABASE_URL = HARDCODED_URL || localStorage.getItem('syncraft_supabase_url') || '';
export const SUPABASE_ANON_KEY = HARDCODED_KEY || localStorage.getItem('syncraft_supabase_key') || '';

let supabaseClient = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase client initialized successfully!');
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
  }
} else {
  console.warn(
    'SYNCRAFT: Supabase URL or Anon Key is missing. Please set them in your browser console using:\n\n' +
    "  localStorage.setItem('syncraft_supabase_url', 'https://your-project.supabase.co');\n" +
    "  localStorage.setItem('syncraft_supabase_key', 'your-anon-key-here');\n\n" +
    'Then refresh the page to establish a database link.'
  );
}

export { supabaseClient };
