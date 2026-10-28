"use client";
import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "./env";

export function supabaseBrowser() {
  const { url, anonKey } = publicEnv();
  return createBrowserClient(url, anonKey);
}
