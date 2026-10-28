"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { keepFormOnSubmit } from "@/lib/hooks/use-keep-form";
import { signIn } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, { error: null });
  return (
    <form onSubmit={keepFormOnSubmit(action)} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="text-sm text-ink-2">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-1 block min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base"
        />
      </label>
      <label className="block">
        <span className="text-sm text-ink-2">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 block min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
