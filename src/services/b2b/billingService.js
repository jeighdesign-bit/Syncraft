import { createAdminClient } from '@/utils/supabase/service';

/**
 * Checks if the company's wallet has enough credits.
 */
export async function checkBalance(wallet, requiredCredits) {
  if (!wallet) {
    return { hasBalance: false, error: 'Wallet not found.' };
  }

  if (wallet.balance_credits < requiredCredits) {
    return { hasBalance: false, error: `Insufficient credits. Required: ${requiredCredits}, Available: ${wallet.balance_credits}` };
  }

  return { hasBalance: true };
}

/**
 * Deducts credits from the wallet and logs the usage.
 * Only call this AFTER a successful generation.
 */
export async function deductAndLog(companyId, apiKeyId, creditsToDeduct, rawCostUsd, endpoint, isSuccess, errorMessage = null) {
  const supabase = createAdminClient();

  try {
    if (isSuccess) {
      // Deduct credits from wallet
      // We use Supabase RPC for atomic decrement to prevent race conditions, 
      // but for MVP a simple read/write is okay if volume is low.
      // Better: we can just use the standard update.
      const { data: wallet } = await supabase
        .from('b2b_wallets')
        .select('balance_credits')
        .eq('company_id', companyId)
        .single();

      if (wallet) {
        await supabase
          .from('b2b_wallets')
          .update({ 
            balance_credits: wallet.balance_credits - creditsToDeduct,
            updated_at: new Date().toISOString()
          })
          .eq('company_id', companyId);
      }
    }

    // Log the API usage regardless of success/failure
    await supabase
      .from('b2b_usage_logs')
      .insert({
        company_id: companyId,
        api_key_id: apiKeyId,
        status: isSuccess ? 'success' : 'failed',
        credits_charged: isSuccess ? creditsToDeduct : 0, // Only charge on success
        pipeline_cost_usd: rawCostUsd,
        error_message: errorMessage,
        endpoint_called: endpoint
      });

    return true;
  } catch (error) {
    console.error("[Billing Service] Failed to deduct and log:", error);
    return false; // We don't throw, we just log it. In production, this should trigger an alert.
  }
}
