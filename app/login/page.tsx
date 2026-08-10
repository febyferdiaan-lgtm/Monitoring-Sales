import { redirect } from "next/navigation";
import LoginClient from "./login-client";
import { createSupabaseServerClient, isSupabaseConfigured } from "../supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!isSupabaseConfigured()) redirect("/");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/");
  return <LoginClient />;
}
