/**
 * Load /content into the database (idempotent upserts). Run after migrations:
 *   npm run content:seed
 */
import { seedBaseContent } from "../lib/seed/base";
import { adminClient } from "./_env";

seedBaseContent(adminClient())
  .then(({ categories, subtopics }) => console.log(`✓ ${categories} categories, ${subtopics} subtopics`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
