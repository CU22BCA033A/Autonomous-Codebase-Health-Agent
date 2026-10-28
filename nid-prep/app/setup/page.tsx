import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { SetupForm } from "./setup-form";
import { setupStatus } from "./status";

export const dynamic = "force-dynamic";

const REPO_SQL = "https://github.com/CU22BCA033A/Veeru-NID/blob/main/supabase/setup.sql";

export default async function SetupPage() {
  const status = await setupStatus();
  return (
    <main className="mx-auto max-w-xl px-5 py-10">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-accent">One-time setup</p>
      <h1 className="mt-2 font-serif text-3xl">Let&apos;s get the studio ready</h1>

      <ol className="mt-6 space-y-3 text-sm">
        {[
          ["env", "Connect Supabase (Vercel environment variables)"],
          ["schema", "Create the database tables (paste one SQL file)"],
          ["accounts", "Create Veeru's and GB's accounts"],
        ].map(([id, label], i) => {
          const order = ["env", "schema", "accounts", "done"];
          const done = order.indexOf(status.step) > i;
          const active = status.step === id;
          return (
            <li key={id} className={active ? "font-semibold" : done ? "text-good" : "text-ink-3"}>
              {done ? "✓" : `${i + 1}.`} {label}
            </li>
          );
        })}
      </ol>

      <Card className="mt-6">
        {status.step === "env" && (
          <div className="space-y-3 text-sm leading-relaxed">
            <p className="font-medium">These environment variables are missing in Vercel:</p>
            <ul className="list-inside list-disc font-mono text-xs">
              {status.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <p>
              Find them in Supabase → <b>Project Settings → API</b> (Project URL, <code>anon</code> public key,{" "}
              <code>service_role</code> secret key). Add them in Vercel → your project → <b>Settings → Environment Variables</b>,
              then <b>Deployments → ⋯ → Redeploy</b>.
            </p>
          </div>
        )}
        {status.step === "schema" && (
          <div className="space-y-3 text-sm leading-relaxed">
            <p className="font-medium">Supabase is connected, but the tables don&apos;t exist yet.</p>
            <ol className="list-inside list-decimal space-y-1">
              <li>
                Open{" "}
                <a className="underline" href={REPO_SQL} target="_blank" rel="noreferrer">
                  supabase/setup.sql
                </a>{" "}
                and copy all of it (the &ldquo;Raw&rdquo; button helps).
              </li>
              <li>
                In Supabase, open <b>SQL Editor → New query</b>, paste, and press <b>Run</b>.
              </li>
              <li>Come back and reload this page.</li>
            </ol>
            <p className="text-xs text-ink-3">Database said: {status.detail}</p>
          </div>
        )}
        {status.step === "accounts" && <SetupForm />}
        {status.step === "done" && (
          <div className="space-y-3">
            <p>Setup is complete. This page is now locked.</p>
            <ButtonLink href="/login">Go to sign in</ButtonLink>
          </div>
        )}
      </Card>
    </main>
  );
}
