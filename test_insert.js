require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testInsert() {
  const { data, error } = await supabase.from('projects').insert([{ trace_type: 'mockup_erase' }]).select();
  console.log(error || data);
}
testInsert();
