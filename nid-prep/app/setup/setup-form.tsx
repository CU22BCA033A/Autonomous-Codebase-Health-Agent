"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { keepFormOnSubmit } from "@/lib/hooks/use-keep-form";
import { runSetup } from "./actions";

const field = "mt-1 block min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base";

function Field({ label, name, type = "text", defaultValue, hint }: { label: string; name: string; type?: string; defaultValue?: string; hint?: string }) {
  return (
    <label className="block">
      <span className="text-sm text-ink-2">{label}</span>
      <input name={name} type={type} defaultValue={defaultValue} required className={field} autoComplete="off" />
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

export function SetupForm() {
  const [state, action, pending] = useActionState(runSetup, { error: null });
  return (
    <form onSubmit={keepFormOnSubmit(action)} className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="font-medium">Student</legend>
        <Field label="Name" name="studentName" defaultValue="Veeru" />
        <Field label="Email" name="studentEmail" type="email" />
        <Field label="Password" name="studentPassword" type="password" hint="At least 8 characters." />
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="font-medium">Mentor</legend>
        <Field label="Name" name="mentorName" defaultValue="GB" />
        <Field label="Email" name="mentorEmail" type="email" />
        <Field label="Password" name="mentorPassword" type="password" />
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="font-medium">Prove it&apos;s your project</legend>
        <Field
          label="Supabase service_role (secret) key"
          name="secret"
          type="password"
          hint="The same key you pasted into Vercel as SUPABASE_SERVICE_ROLE_KEY. It is only compared on the server, never stored."
        />
      </fieldset>
      {state.error && (
        <p role="alert" className="rounded-xl bg-bad-soft p-3 text-sm text-bad">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Setting up…" : "Create accounts & load content"}
      </Button>
    </form>
  );
}
