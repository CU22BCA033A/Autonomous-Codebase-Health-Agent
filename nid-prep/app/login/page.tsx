import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-accent">NID DAT 2027</p>
      <h1 className="mt-2 font-serif text-4xl leading-tight">Prep Studio</h1>
      <p className="mt-2 text-ink-2">100 days. One sketchbook. Let&apos;s get you in.</p>
      {error === "no-profile" && (
        <p role="alert" className="mt-6 rounded-xl bg-warn-soft p-3 text-sm text-warn">
          This account has no profile yet. Ask your mentor to run <code>npm run setup:users</code>.
        </p>
      )}
      <div className="mt-8">
        <LoginForm next={next ?? "/"} />
      </div>
    </main>
  );
}
