"use server";
import { timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ensureAccount, seedBaseContent } from "@/lib/seed/base";
import { supabaseAdmin } from "@/lib/supabase/server";
import { supabaseServiceKey } from "@/lib/supabase/env";
import { setupStatus } from "./status";

const schema = z.object({
  secret: z.string().min(1),
  studentName: z.string().trim().min(1).max(40),
  studentEmail: z.string().trim().email(),
  studentPassword: z.string().min(8, "Passwords need at least 8 characters"),
  mentorName: z.string().trim().min(1).max(40),
  mentorEmail: z.string().trim().email(),
  mentorPassword: z.string().min(8, "Passwords need at least 8 characters"),
});

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function runSetup(_prev: { error: string | null }, form: FormData): Promise<{ error: string | null }> {
  // Only works once: as soon as a mentor exists, setup is closed.
  const status = await setupStatus();
  if (status.step !== "accounts") return { error: "Setup is already complete or not ready yet. Reload the page." };

  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const d = parsed.data;
  // Proves the person setting up owns the Supabase project.
  if (!sameSecret(d.secret.trim(), supabaseServiceKey() ?? "")) {
    return { error: "That isn't this project's service_role / secret key." };
  }
  if (d.studentEmail.toLowerCase() === d.mentorEmail.toLowerCase()) {
    return { error: "Student and mentor need different emails." };
  }

  try {
    const db = supabaseAdmin();
    await seedBaseContent(db);
    await ensureAccount(db, { email: d.studentEmail, password: d.studentPassword, role: "student", name: d.studentName });
    await ensureAccount(db, { email: d.mentorEmail, password: d.mentorPassword, role: "mentor", name: d.mentorName });
  } catch (e) {
    return { error: `Setup failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  redirect("/login?setup=done");
}
