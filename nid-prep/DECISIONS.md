# Decisions

Product and engineering calls made while building, with the reason. Newest at the bottom.

1. **Zero-cost stack.** No paid APIs. Vercel Hobby + Supabase Free. Seed content is authored directly in `/content` (in the repo), not generated through a paid API.
2. **AI critique is optional and off by default** (`AI_PROVIDER=none`). Studio feedback works fully through self-assessment against the rubric, a per-task examiner checklist, and mentor scoring. A free provider (Gemini / Groq free tier) can be switched on later through env vars. Free tiers may use submitted data for training, so it's the mentor's choice.
3. **Lower minimum items in P4/P5.** The brief requires ≥40 items/day, and it also says P4 should be 20–25 min/day during CBSE boards. These two rules can't both hold. So P1–P3 keep `minItems: 40`, P4 uses 12 and P5 uses 15. Exam day uses 0. The mentor can change all of these in `phases.json` / settings.
4. **Students can read item answers through the API.** The `items` rows (including answers) are readable by any signed-in user, which keeps RLS simple and offline caching possible. Veeru is the only student, so the only way to "cheat" is against himself.
5. **No public sign-up.** Accounts are created only by `npm run setup:users` (service role). The profile `role` can't be changed by the user (RLS check).
6. **Plan dates use IST calendar days**, whatever the device timezone is.
7. **Streaks skip rest and exam days.** Rest days (Day 49) and exam day (Day 50) never break a streak.
8. **Exam dates come from the brief.** Admin shows "verify on admissions.nid.edu". The Mains date is a placeholder (20 Apr 2027) marked tentative.
9. **One-time `/setup` page instead of CLI steps for publishing.** After deploying, the owner opens `/setup` and creates both accounts, which also loads the base content. To prove they own the project, they paste the Supabase service_role key; it is compared on the server with a timing-safe check and never stored. The page locks permanently once a mentor exists.
10. **`supabase/setup.sql`** is generated from the migrations (`npm run db:bundle`), so publishing needs only one paste into the SQL editor. A unit test fails if it falls out of sync.
11. **Both key-name styles are accepted** for env vars: `NEXT_PUBLIC_SUPABASE_ANON_KEY`/`…_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_SECRET_KEY`, so either Supabase dashboard style works.
