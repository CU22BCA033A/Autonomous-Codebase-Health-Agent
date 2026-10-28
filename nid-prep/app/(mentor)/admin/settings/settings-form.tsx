"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { saveSettings } from "./actions";

const field = "mt-1 block min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base";

export function SettingsForm(props: { mentorMessage: string; startDate: string; targetReadiness: number }) {
  const [state, action, pending] = useActionState(saveSettings, { message: null });
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="text-sm text-ink-2">Message on Veeru&apos;s home screen</span>
        <textarea name="mentorMessage" defaultValue={props.mentorMessage} rows={3} maxLength={400} className={`${field} py-2`} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm text-ink-2">Day 1 date</span>
          <input type="date" name="startDate" defaultValue={props.startDate} required className={field} />
        </label>
        <label className="block">
          <span className="text-sm text-ink-2">Target readiness (0–100)</span>
          <input type="number" name="targetReadiness" min={0} max={100} defaultValue={props.targetReadiness} className={field} />
        </label>
      </div>
      {state.message && <p role="status" className="text-sm text-ink-2">{state.message}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
