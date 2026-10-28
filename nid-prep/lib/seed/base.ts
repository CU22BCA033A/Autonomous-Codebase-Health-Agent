import type { SupabaseClient } from "@supabase/supabase-js";
import taxonomy from "@/content/taxonomy.json";
import { defaultExamFacts, defaultPhases } from "@/lib/config/defaults";

/** Load base content (taxonomy, default settings). Idempotent; never overwrites the mentor's settings. */
export async function seedBaseContent(db: SupabaseClient): Promise<{ categories: number; subtopics: number }> {
  const categories = taxonomy.categories.map((c, i) => ({ id: c.id, name: c.name, description: c.description, sort: i }));
  const subtopics = taxonomy.categories.flatMap((c) => c.subtopics.map((s) => ({ id: s.id, name: s.name, category_id: c.id })));
  await must(db.from("categories").upsert(categories), "categories");
  await must(db.from("subtopics").upsert(subtopics), "subtopics");

  const { data: existing } = await db.from("settings").select("id").eq("id", 1).maybeSingle();
  if (!existing) {
    await must(db.from("settings").insert({ id: 1, exam_facts: defaultExamFacts, phases: defaultPhases }), "settings");
  }
  return { categories: categories.length, subtopics: subtopics.length };
}

/** Create the auth user (or reset its password) and its profile. */
export async function ensureAccount(
  db: SupabaseClient,
  { email, password, role, name }: { email: string; password: string; role: "student" | "mentor"; name: string },
): Promise<void> {
  const { data: list, error: listErr } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw listErr;
  let user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (user) {
    const { error } = await db.auth.admin.updateUserById(user.id, { password });
    if (error) throw error;
  } else {
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    user = data.user;
  }
  await must(db.from("profiles").upsert({ id: user.id, role, display_name: name }), "profiles");
}

async function must(p: PromiseLike<{ error: { message: string } | null }>, what: string) {
  const { error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
}
