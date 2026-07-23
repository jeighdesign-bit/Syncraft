import { createAdminClient } from '@/utils/supabase/service';

/**
 * Validates a B2B API Key and returns the associated company and wallet.
 * @param {string} apiKey - The raw API key provided in the Authorization header.
 * @returns {object} { isValid: boolean, company: object, wallet: object, error: string }
 */
export async function validateApiKey(apiKey) {
  if (!apiKey) {
    return { isValid: false, error: 'API Key is missing.' };
  }

  const supabase = createAdminClient();

  // 1. Find the API key in the database
  const { data: apiKeyRecord, error: keyError } = await supabase
    .from('b2b_api_keys')
    .select('*, b2b_companies(*)')
    .eq('api_key', apiKey)
    .single();

  if (keyError || !apiKeyRecord) {
    return { isValid: false, error: 'Invalid API Key.' };
  }

  if (!apiKeyRecord.is_active) {
    return { isValid: false, error: 'API Key is disabled.' };
  }

  if (!apiKeyRecord.b2b_companies.is_active) {
    return { isValid: false, error: 'Company account is disabled.' };
  }

  // 2. Get the company's wallet
  const { data: walletRecord, error: walletError } = await supabase
    .from('b2b_wallets')
    .select('*')
    .eq('company_id', apiKeyRecord.company_id)
    .single();

  if (walletError || !walletRecord) {
    return { isValid: false, error: 'Wallet not found for this company.' };
  }

  // 3. Update the last_used_at timestamp (fire and forget to not block execution)
  supabase
    .from('b2b_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', apiKeyRecord.id)
    .then();

  return {
    isValid: true,
    apiKeyId: apiKeyRecord.id,
    company: apiKeyRecord.b2b_companies,
    wallet: walletRecord
  };
}
