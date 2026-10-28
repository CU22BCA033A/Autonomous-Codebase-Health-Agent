# NID Prep Studio

Veeru's 100-day preparation platform for **NID DAT 2027 (B.Des)**. It has a quick-practice engine (MCQs, visual puzzles, short ideation) and a studio engine (timed paper drawing tasks, photo upload, rubric feedback). There are two roles: `student` and `mentor`.

Stack: Next.js 15 · TypeScript · Tailwind v4 · Supabase (Postgres, RLS, Auth, Storage, Realtime) · Zod · Vitest · Playwright. Running it costs ₹0 on free tiers.

## Local setup

```bash
npm install
npx supabase start            # needs Docker; prints API URL + keys
cp .env.example .env.local    # fill NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY
npm run content:seed
npm run setup:users -- --student-email veeru@example.com --student-password '…' --mentor-email gb@example.com --mentor-password '…'
npm run dev
```

## Production (free tier)

1. Create a free Supabase project. Run `npx supabase link --project-ref <ref>`, then `npx supabase db push`.
2. Set the same env vars locally against the hosted project, then run `npm run content:seed` and `npm run setup:users -- …`.
3. Import the `nid-prep` folder into Vercel (root directory `nid-prep`) and add the three Supabase env vars.

## Checks

| Command | What it does |
|---|---|
| `npm run typecheck` | TypeScript strict |
| `npm test` | Vitest unit tests (calendar, streaks, builders, generators…) |
| `PGHOST=… scripts/test-db.sh` | Applies migrations to plain Postgres with Supabase shims and asserts RLS |
| `npm run build && npm run e2e` | Playwright against the local stack (test accounts in `e2e/helpers.ts`) |

## Content

- `content/exam-facts.json`: dates and exam pattern. The mentor can override these from settings.
- `content/phases.json`: the 100-day phases and the daily mix for each phase.
- `content/taxonomy.json`: categories and subtopics.
- `content/checklists.json`: logistics, stationery kit and exam-day checklists.

See `DECISIONS.md` for product calls.
