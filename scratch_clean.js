require('dotenv').config({ path: '.env.local' });
global.WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');

async function run() {
  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: fetch } }
  );

  console.log('Wiping database projects ONE BY ONE...');
  let deletingDb = true;
  let totalDeleted = 0;
  while(deletingDb) {
    const { data: batch, error } = await adminSupabase.from('projects').select('id').limit(50);
    if (error) {
      console.error('DB fetch error:', error.message);
      break;
    }
    if (!batch || batch.length === 0) {
      deletingDb = false;
      break;
    }
    
    for (const project of batch) {
      const { error: delErr } = await adminSupabase.from('projects').delete().eq('id', project.id);
      if (delErr) {
         console.error(`Error deleting project ${project.id}:`, delErr.message);
      } else {
         totalDeleted++;
      }
    }
    console.log(`Deleted ${totalDeleted} projects from DB so far...`);
  }
  console.log('Finished wiping DB projects.');
}

run();
