/**
 * Supabase env vars. Accepts both the classic names (ANON / SERVICE_ROLE) and the newer
 * names the Vercel ↔ Supabase integration may set (PUBLISHABLE / SECRET).
 */
export function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export function supabaseAnonKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
}

export function supabaseServiceKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
}

export function isConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}

export function publicEnv() {
  const url = supabaseUrl();
  const anonKey = supabaseAnonKey();
  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — see README → Publish");
  }
  return { url, anonKey };
}
