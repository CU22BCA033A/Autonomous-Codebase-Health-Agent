import Link from "next/link";
import { DAY_STEPS, currentStep, type StepId, type StepState } from "@/lib/plan/steps";
import { cn } from "@/lib/cn";

/** Vertical stepper for today's loop. `hrefs` maps steps that are reachable to their route. */
export function DayStepper({ state, hrefs }: { state: StepState; hrefs: Partial<Record<StepId, string>> }) {
  const active = currentStep(state);
  return (
    <ol className="relative space-y-1">
      {DAY_STEPS.map((step, i) => {
        const done = Boolean(state[step.id]);
        const isActive = step.id === active;
        const href = hrefs[step.id];
        const body = (
          <div className={cn("flex items-start gap-3 rounded-xl p-3", isActive && "bg-accent-soft", href && "hover:bg-surface-2")}>
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                done && "border-good bg-good text-white",
                isActive && !done && "border-accent bg-accent text-accent-ink",
                !done && !isActive && "border-line text-ink-3",
              )}
            >
              {done ? "✓" : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("font-medium", !done && !isActive && "text-ink-2")}>
                {step.label}
                <span className="sr-only">{done ? " (done)" : isActive ? " (current)" : ""}</span>
              </p>
              <p className="text-sm text-ink-3">
                {step.detail} · ~{step.minutes} min
              </p>
            </div>
          </div>
        );
        return <li key={step.id}>{href ? <Link href={href}>{body}</Link> : body}</li>;
      })}
    </ol>
  );
}
