import DashboardClient from "./dashboard-client";
import { requireChatGPTUser } from "./chatgpt-auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, isSupabaseConfigured } from "./supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
  } else {
    await requireChatGPTUser("/");
  }
  return <DashboardClient />;
}
