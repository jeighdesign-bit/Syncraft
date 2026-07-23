import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import crypto from "crypto";

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '').trim();
    
    // 1. Authenticate the User
    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: Invalid session' }, { status: 401 });
    }

    // 2. Fetch their B2B Company Profile
    const { data: company, error: companyError } = await adminSupabase
      .from('b2b_companies')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: 'B2B Profile not found' }, { status: 404 });
    }

    // 3. Generate a new API Key (e.g. syncraft_live_a1b2c3d4...)
    const rawRandom = crypto.randomBytes(24).toString('hex');
    const newApiKey = `syncraft_live_${rawRandom}`;

    // 4. Insert into b2b_api_keys
    const { data: insertedKey, error: insertErr } = await adminSupabase
      .from('b2b_api_keys')
      .insert({
        company_id: company.id,
        api_key: newApiKey
      })
      .select('id, api_key, is_active, created_at, last_used_at')
      .single();

    if (insertErr) throw insertErr;

    return NextResponse.json({
      success: true,
      apiKey: insertedKey
    });

  } catch (error) {
    console.error("[B2B Key Generation Error]:", error);
    return NextResponse.json({ error: error.message || "Failed to generate API Key" }, { status: 500 });
  }
}
