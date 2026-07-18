import { redirect } from "next/navigation";
import WorkstationApp from "@/components/workstation/WorkstationApp";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function Home() {
  const configured = isSupabaseConfigured();
  if (configured) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) redirect("/login");
  }
  return <WorkstationApp mode={configured ? "supabase" : "legacy"} />;
}
