"use client";
import { useEffect, useState } from "react";
import { countdown } from "@/lib/plan/calendar";

export function Countdown({ label, at, note }: { label: string; at: string; note?: string }) {
  const target = new Date(at);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const c = now ? countdown(target, now) : null;
  const when = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(target);
  return (
    <div>
      <p className="text-sm text-ink-2">
        {label} · {when}
      </p>
      <p className="mt-1 font-serif text-4xl tabular-nums" aria-live="polite">
        {c ? (
          <>
            {c.days}
            <span className="text-lg text-ink-3"> d </span>
            {c.hours}
            <span className="text-lg text-ink-3"> h </span>
            {c.minutes}
            <span className="text-lg text-ink-3"> m</span>
          </>
        ) : (
          <span className="text-ink-3">—</span>
        )}
      </p>
      {note && <p className="mt-1 text-xs text-ink-3">{note}</p>}
    </div>
  );
}
