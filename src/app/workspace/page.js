import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import StartScreen from "../components/StartScreen";

export default async function WorkspaceHome() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/");

  return <StartScreen workspaceRoute initialUser={user} />;
}
