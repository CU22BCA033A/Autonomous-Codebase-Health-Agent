# NID Prep Studio

Veeru's 100-day preparation platform for **NID DAT 2027 (B.Des)**. It has two engines:
- a quick-practice engine: MCQs, visual puzzles, short ideation answers
- a studio engine: timed paper drawing tasks with photo upload and rubric feedback

There are two roles, `student` (Veeru) and `mentor` (GB). Running it costs **₹0** on the free tiers of Vercel and Supabase.

---

## Publish it (about 15 minutes, no coding)

You need free accounts on **GitHub** (you have one), **[Supabase](https://supabase.com)** and **[Vercel](https://vercel.com)**. Sign in to both with GitHub.

### Step 1: Create the database (Supabase)

1. Supabase → **New project**. Name it `nid-prep` and choose a strong database password (save it somewhere). For **Region**, pick **Mumbai (ap-south-1)**. Wait about 2 minutes while it starts.
2. Open **SQL Editor → New query**.
3. Open [`supabase/setup.sql`](supabase/setup.sql) in this repo and click **Raw**. Select all, copy, and paste it into the editor. Press **Run**. You should see *"Success. No rows returned"*.
4. Go to **Project Settings → API Keys** (on some dashboards: **Project Settings → API**) and keep the tab open. You need three values:
   - **Project URL**, for example `https://abcdxyz.supabase.co`. It's under Project Settings → Data API, or shown on the project home page.
   - **anon / public** key (or the new **publishable** key, `sb_publishable_…`)
   - **service_role** key (or the new **secret** key, `sb_secret_…`). ⚠️ Keep this one private.

### Step 2: Put the website online (Vercel)

1. Vercel → **Add New… → Project** → find **Veeru-NID** → **Import**.
2. Leave every build setting as it is (Vercel detects Next.js). Open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL from step 1 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key |

3. Click **Deploy**. When it finishes you get a link like `https://veeru-nid.vercel.app`.

> If you deployed before adding the variables, add them under **Settings → Environment Variables**. Then go to **Deployments → ⋯ → Redeploy**, because the variables only take effect after a new build.

### Step 3: Create the two accounts (in the app)

1. Open `https://<your-app>.vercel.app/setup`.
2. Fill in Veeru's email and password, then GB's email and password. Paste the **service_role / secret key** once; this proves you own the project. Press **Create accounts & load content**.
3. You land on the sign-in page. Done. The setup page then locks itself for good.

### Step 4: Put it on Veeru's phone

Open the link in Chrome on his phone, sign in, then tap **⋮ → Add to Home screen**. It opens like an app.

### Updating later

Every push to `main` on GitHub redeploys automatically. If an update adds new database migrations, the release notes will say so. In that case, open the new file in `supabase/migrations/` and run it in the SQL Editor the same way you did in step 1.

### Good to know

- The Supabase free tier **pauses a project after 7 days of no use**. Daily practice keeps it awake. If it pauses, click **Restore** in Supabase.
- AI feedback is **off** (`AI_PROVIDER=none`), so nothing costs money. Studio work is scored by Veeru's self-assessment plus GB's review.
- Forgot a password? The setup page is locked by then, so change it in Supabase → **Authentication → Users** → click the user → **Update password**.

---

## Developer setup (local)

```bash
npm install
npx supabase start            # needs Docker; prints API URL + keys
cp .env.example .env.local    # fill NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY
npm run content:seed
npm run setup:users -- --student-email veeru@example.com --student-password veeru-test-1 --mentor-email gb@example.com --mentor-password gb-test-12
npm run dev
```

Alternatively, with the Supabase CLI against a hosted project, run `npx supabase link --project-ref <ref>` and then `npx supabase db push`.

## Checks

| Command | What it does |
|---|---|
| `npm run typecheck` | TypeScript strict |
| `npm test` | Vitest unit tests (calendar, streaks, setup.sql in sync, …) |
| `PGHOST=… scripts/test-db.sh` | Applies the migrations to plain Postgres with Supabase shims and asserts the RLS rules |
| `npm run build && npm run e2e` | Playwright against the local stack (test accounts are in `e2e/helpers.ts`) |
| `npm run db:bundle` | Regenerates `supabase/setup.sql` from `supabase/migrations/`. Run it after adding a migration |

## Content

- `content/exam-facts.json`: dates and exam pattern. The mentor can override these in Settings.
- `content/phases.json`: the 100-day phases and the daily mix for each phase.
- `content/taxonomy.json`: categories and subtopics.
- `content/checklists.json`: logistics, stationery kit and exam-day checklists.

See `DECISIONS.md` for product calls.
