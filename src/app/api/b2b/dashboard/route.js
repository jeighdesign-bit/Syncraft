import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";

export const runtime = 'nodejs';

export async function GET(request) {
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
    let { data: company, error: companyError } = await adminSupabase
      .from('b2b_companies')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // 3. Auto-Enrollment (If they don't have a B2B profile yet, create one)
    if (!company) {
      console.log(`[B2B Dashboard] Auto-enrolling new user ${user.id} into B2B...`);
      
      const { data: newCompany, error: createCompanyErr } = await adminSupabase
        .from('b2b_companies')
        .insert({
          user_id: user.id,
          name: user.email.split('@')[0] + "'s API App",
          contact_email: user.email
        })
        .select()
        .single();

      if (createCompanyErr) throw createCompanyErr;
      company = newCompany;

      // Create an empty wallet for the new company
      const { error: walletErr } = await adminSupabase
        .from('b2b_wallets')
        .insert({
          company_id: company.id,
          balance_credits: 0
        });
      if (walletErr) throw walletErr;
    }

    // 4. Fetch Wallet Balance
    const { data: wallet, error: fetchWalletErr } = await adminSupabase
      .from('b2b_wallets')
      .select('balance_credits')
      .eq('company_id', company.id)
      .single();

    if (fetchWalletErr) throw fetchWalletErr;

    // 5. Fetch API Keys
    const { data: apiKeys, error: fetchKeysErr } = await adminSupabase
      .from('b2b_api_keys')
      .select('id, api_key, is_active, created_at, last_used_at')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false });

    if (fetchKeysErr) throw fetchKeysErr;

    return NextResponse.json({
      success: true,
      company: {
        id: company.id,
        name: company.name,
      },
      wallet: {
        balance_credits: wallet.balance_credits
      },
      apiKeys: apiKeys
    });

  } catch (error) {
    console.error("[B2B Dashboard GET Error]:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch dashboard data" }, { status: 500 });
  }
}
