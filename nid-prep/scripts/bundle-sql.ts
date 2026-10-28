/**
 * Concatenate supabase/migrations/*.sql into supabase/setup.sql — the single file you paste
 * into the Supabase SQL editor when publishing without the CLI.  npm run db:bundle
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export function bundleMigrations(dir = "supabase/migrations"): string {
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const header =
    "-- NID Prep Studio — full database setup.\n" +
    "-- Paste this whole file into Supabase → SQL Editor → New query → Run. Run it once on a fresh project.\n" +
    "-- Generated from supabase/migrations by `npm run db:bundle`; do not edit by hand.\n";
  return header + files.map((f) => `\n-- ── ${f} ──\n\n${readFileSync(path.join(dir, f), "utf8").trim()}\n`).join("");
}

if (process.argv[1]?.endsWith("bundle-sql.ts")) {
  writeFileSync("supabase/setup.sql", bundleMigrations());
  console.log("✓ wrote supabase/setup.sql");
}
