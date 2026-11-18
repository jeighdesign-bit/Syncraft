import { redirect } from "next/navigation";
import { adminSupabase } from "@/lib/supabase";
import { createClient } from "@/utils/supabase/server";
import StartScreen from "../components/StartScreen";

export default async function WorkspaceHome() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (!user) {
    console.warn('[Workspace auth] ' + JSON.stringify({ code: error?.code, status: error?.status, name: error?.name, message: error?.message }));
    if (error?.name === 'AuthRetryableFetchError' || error?.status >= 500) redirect('/?error=auth-unavailable');
    redirect("/?login=required");
  }

  let welcomeCredits = 0;
  if (adminSupabase) {
    const { data: grant, error: grantError } = await adminSupabase
      .from("credit_logs")
      .select("amount")
      .eq("idempotency_key", `welcome_credits:${user.id}`)
      .eq("user_id", user.id)
      .eq("feature", "welcome_credits")
      .eq("transaction_type", "grant")
      .eq("transaction_status", "succeeded")
      .maybeSingle();

    if (grantError) {
      console.warn("[Workspace onboarding] Could not read welcome credit grant:", grantError.code);
    } else if (Number.isInteger(grant?.amount) && grant.amount > 0) {
      welcomeCredits = grant.amount;
    }
  }

  return <StartScreen workspaceRoute initialUser={user} welcomeCredits={welcomeCredits} />;
}
