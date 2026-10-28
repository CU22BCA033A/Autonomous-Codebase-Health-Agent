import type { Milestone, Phase, PhasesConfig } from "@/lib/config/schemas";

/** All plan dates are calendar days in India. */
export const TZ = "Asia/Kolkata";

/** YYYY-MM-DD for `date` as seen in IST. */
export function istDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function dayIndex(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function addDays(ymd: string, n: number): string {
  const ms = (dayIndex(ymd) + n) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Day number (1-based) for a calendar date. 0 or negative = before start; > totalDays = after the plan. */
export function dayNumberFor(ymd: string, startDate: string): number {
  return dayIndex(ymd) - dayIndex(startDate) + 1;
}

export function dateForDay(dayNo: number, startDate: string): string {
  return addDays(startDate, dayNo - 1);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(ymd: string): number {
  return (dayIndex(ymd) + 4) % 7; // 1970-01-01 was a Thursday
}

export function phaseForDay(dayNo: number, cfg: PhasesConfig): Phase | null {
  return cfg.phases.find((p) => dayNo >= p.fromDay && dayNo <= p.toDay) ?? null;
}

export type DayKind = "before-start" | "study" | "mock" | "rest" | "exam" | "after-plan";

export function dayKind(dayNo: number, cfg: PhasesConfig): DayKind {
  if (dayNo < 1) return "before-start";
  if (dayNo > cfg.totalDays) return "after-plan";
  const phase = phaseForDay(dayNo, cfg);
  if (!phase) return "after-plan";
  if (phase.id === "EXAM") return "exam";
  if (phase.restDays?.includes(dayNo)) return "rest";
  if (phase.fullMockDays?.includes(dayNo)) return "mock";
  if (phase.mock && weekdayOf(dateForDay(dayNo, cfg.startDate)) === phase.mock.weekday) return "mock";
  return "study";
}

export function nextMilestone(milestones: Milestone[], now: Date): Milestone | null {
  const upcoming = milestones
    .filter((m) => new Date(m.at).getTime() > now.getTime())
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return upcoming[0] ?? null;
}

export function countdown(target: Date, now: Date): { days: number; hours: number; minutes: number } {
  const ms = Math.max(0, target.getTime() - now.getTime());
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return { days, hours, minutes };
}

export function greeting(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hour12: false }).format(now));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
