import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bundleMigrations } from "@/scripts/bundle-sql";

describe("supabase/setup.sql", () => {
  it("is up to date with the migrations (run `npm run db:bundle`)", () => {
    expect(readFileSync("supabase/setup.sql", "utf8")).toBe(bundleMigrations());
  });
});
