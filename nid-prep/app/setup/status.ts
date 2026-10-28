import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseServiceKey, supabaseUrl } from "@/lib/supabase/env";

export type SetupStatus =
  | { step: "env"; missing: string[] }
  | { step: "schema"; detail: string }
  | { step: "accounts" }
  | { step: "done" };

/** Where a fresh deployment is in the one-time setup. */
export async function setupStatus(): Promise<SetupStatus> {
  const missing: string[] = [];
  if (!supabaseUrl()) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseAnonKey()) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!supabaseServiceKey()) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) return { step: "env", missing };

  const db = createClient(supabaseUrl()!, supabaseServiceKey()!, { auth: { persistSession: false } });
  const { count, error } = await db.from("profiles").select("*", { count: "exact", head: true }).eq("role", "mentor");
  if (error) return { step: "schema", detail: error.message };
  return (count ?? 0) > 0 ? { step: "done" } : { step: "accounts" };
}
