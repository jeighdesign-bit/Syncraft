import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export default async function LogoStudioLayout({ children }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/?signin=logo-studio");
  return children;
}
