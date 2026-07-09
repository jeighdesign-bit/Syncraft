require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRefund() {
  const { data, error } = await supabase.rpc('refund_credit', { target_user_id: '123', target_project_id: '123' });
  console.log("RPC Error:", error);
}
checkRefund();
