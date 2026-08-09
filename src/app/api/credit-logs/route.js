import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function GET(req) {
  try {
    if (!supabaseUrl || !supabaseServiceRoleKey || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Credit logs are not configured.' }, { status: 503 });
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    // Verify token using standard client
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Create the service-role client only at request time so builds do not
    // evaluate a client with unavailable runtime secrets.
    const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data, error } = await adminSupabase
      .from('credit_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json({ logs: data });
  } catch (error) {
    console.error('Error fetching credit logs:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
