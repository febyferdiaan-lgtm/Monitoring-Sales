import { redirect } from "next/navigation";
import UpdatePasswordClient from "./update-password-client";
import { createSupabaseServerClient, isSupabaseConfigured } from "../supabase/server";

export const dynamic = "force-dynamic";

export default async function UpdatePasswordPage() {
  if (!isSupabaseConfigured()) redirect("/");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <UpdatePasswordClient />;
}
