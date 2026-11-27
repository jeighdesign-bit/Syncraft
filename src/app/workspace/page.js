import { redirect } from "next/navigation";
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

  return <StartScreen workspaceRoute initialUser={user} />;
}
