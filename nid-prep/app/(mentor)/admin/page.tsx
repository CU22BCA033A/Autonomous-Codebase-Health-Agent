import { Card, CardLabel } from "@/components/ui/card";
import { requireViewer, studentProfile } from "@/lib/auth";
import { loadSettings } from "@/lib/config/settings";
import { dayNumberFor, istDateString, phaseForDay } from "@/lib/plan/calendar";
import { supabaseServer } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";

export default async function MentorHome() {
  const viewer = await requireViewer("mentor");
  const student = await studentProfile();
  const { phases } = await loadSettings();
  const today = dayNumberFor(istDateString(new Date()), phases.startDate);
  const phase = phaseForDay(today, phases);
  const supabase = await supabaseServer();
  const { count: completed } = student
    ? await supabase.from("daily_plans").select("*", { count: "exact", head: true }).eq("user_id", student.id).eq("status", "completed")
    : { count: 0 };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-ink-2">Mentor view · {viewer.displayName}</p>
          <h1 className="font-serif text-3xl">{student ? `${student.displayName}'s progress` : "No student yet"}</h1>
        </div>
        <form action={signOut}>
          <button className="text-sm text-ink-2 underline">Sign out</button>
        </form>
      </header>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardLabel>Plan day</CardLabel>
          <p className="mt-1 font-serif text-3xl">{today < 1 ? `Starts in ${1 - today}d` : today}</p>
        </Card>
        <Card>
          <CardLabel>Phase</CardLabel>
          <p className="mt-1 font-serif text-xl">{phase ? `${phase.id} · ${phase.name}` : "—"}</p>
        </Card>
        <Card>
          <CardLabel>Days completed</CardLabel>
          <p className="mt-1 font-serif text-3xl">{completed ?? 0}</p>
        </Card>
      </div>
      <p className="text-sm text-ink-3">Detailed analytics, alerts, review queue and content tools arrive in later milestones.</p>
    </div>
  );
}
