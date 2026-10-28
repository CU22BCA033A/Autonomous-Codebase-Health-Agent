/**
 * Load /content into the database (idempotent upserts). Run after migrations:
 *   npm run content:seed
 */
import taxonomy from "../content/taxonomy.json";
import { defaultExamFacts, defaultPhases } from "../lib/config/defaults";
import { adminClient } from "./_env";

async function main() {
  const db = adminClient();

  const categories = taxonomy.categories.map((c, i) => ({ id: c.id, name: c.name, description: c.description, sort: i }));
  const subtopics = taxonomy.categories.flatMap((c) => c.subtopics.map((s) => ({ id: s.id, name: s.name, category_id: c.id })));
  await must(db.from("categories").upsert(categories), "categories");
  await must(db.from("subtopics").upsert(subtopics), "subtopics");

  // Only create the settings row if missing — never overwrite the mentor's edits.
  const { data: existing } = await db.from("settings").select("id").eq("id", 1).maybeSingle();
  if (!existing) {
    await must(db.from("settings").insert({ id: 1, exam_facts: defaultExamFacts, phases: defaultPhases }), "settings");
  }
  console.log(`✓ ${categories.length} categories, ${subtopics.length} subtopics`);
}

async function must(p: PromiseLike<{ error: { message: string } | null }>, what: string) {
  const { error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
