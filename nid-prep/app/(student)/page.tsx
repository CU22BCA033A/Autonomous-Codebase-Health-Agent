import { Card, CardLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Countdown } from "@/components/home/countdown";
import { DayStepper } from "@/components/home/day-stepper";
import { requireViewer } from "@/lib/auth";
import { loadSettings } from "@/lib/config/settings";
import { dayKind, dayNumberFor, greeting, istDateString, nextMilestone, phaseForDay } from "@/lib/plan/calendar";
import type { StepState } from "@/lib/plan/steps";
import { currentStreak } from "@/lib/plan/streak";
import { supabaseServer } from "@/lib/supabase/server";

export default async function HomePage() {
  const viewer = await requireViewer("student");
  const settings = await loadSettings();
  const now = new Date();
  const { phases, examFacts } = settings;
  const today = dayNumberFor(istDateString(now), phases.startDate);
  const kind = dayKind(today, phases);
  const phase = phaseForDay(today, phases);
  const milestone = nextMilestone(examFacts.milestones, now);

  const supabase = await supabaseServer();
  const [{ data: plans }, { data: todayPlan }] = await Promise.all([
    supabase.from("daily_plans").select("day_no").eq("user_id", viewer.id).eq("status", "completed"),
    supabase.from("daily_plans").select("steps, status").eq("user_id", viewer.id).eq("day_no", today).maybeSingle(),
  ]);
  const completed = new Set((plans ?? []).map((p) => p.day_no as number));
  const freeDays = new Set(phases.phases.flatMap((p) => [...(p.restDays ?? []), ...(p.id === "EXAM" ? [p.fromDay] : [])]));
  const streak = currentStreak(completed, today, freeDays);
  const steps = (todayPlan?.steps ?? {}) as StepState;

  const headline =
    kind === "before-start"
      ? `Day 1 starts in ${1 - today} day${1 - today === 1 ? "" : "s"}`
      : kind === "after-plan"
        ? "Mains sprint"
        : `Day ${today} of ${phases.totalDays}`;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-ink-2">
          {greeting(now)}, {viewer.displayName}
        </p>
        <h1 className="font-serif text-3xl leading-tight md:text-4xl">{headline}</h1>
        {phase && kind !== "before-start" && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-2">
            <Badge tone="accent">
              {phase.id} · {phase.name}
            </Badge>
            <span>{phase.focus}</span>
          </p>
        )}
      </header>

      {kind === "exam" && (
        <Card className="border-accent">
          <p className="font-serif text-2xl">Exam day. You&apos;re ready.</p>
          <p className="mt-1 text-ink-2">No practice today. Eat well, reach early, read every brief twice.</p>
          <ButtonLink href="/exam-day" className="mt-4">
            Open exam-day checklist
          </ButtonLink>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {milestone && (
          <Card>
            <CardLabel>Next milestone</CardLabel>
            <div className="mt-2">
              <Countdown label={milestone.label} at={milestone.at} note={milestone.note} />
            </div>
          </Card>
        )}
        <Card>
          <CardLabel>Momentum</CardLabel>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-sm text-ink-2">Streak</dt>
              <dd className="font-serif text-3xl tabular-nums">{streak}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-2">Days completed</dt>
              <dd className="font-serif text-3xl tabular-nums">{completed.size}</dd>
            </div>
          </dl>
        </Card>
      </div>

      {settings.mentorMessage && (
        <Card className="bg-surface-2">
          <CardLabel>From GB</CardLabel>
          <p className="mt-2 font-serif text-lg leading-snug">{settings.mentorMessage}</p>
        </Card>
      )}

      {(kind === "study" || kind === "mock" || kind === "before-start") && (
        <Card>
          <div className="flex items-baseline justify-between">
            <CardLabel>{kind === "before-start" ? "Your daily loop" : "Today"}</CardLabel>
            {kind === "mock" && <Badge tone="warn">Mock day</Badge>}
          </div>
          <div className="mt-3">
            <DayStepper state={steps} hrefs={{}} />
          </div>
        </Card>
      )}

      {kind === "rest" && (
        <Card>
          <p className="font-serif text-xl">Rest day</p>
          <p className="mt-1 text-ink-2">Light sketching only, early night. Tomorrow&apos;s the day after; trust the work you&apos;ve done.</p>
        </Card>
      )}
    </div>
  );
}
