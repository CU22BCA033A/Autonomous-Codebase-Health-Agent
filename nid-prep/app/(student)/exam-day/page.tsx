import checklists from "@/content/checklists.json";
import { Card, CardLabel } from "@/components/ui/card";
import { requireViewer } from "@/lib/auth";
import { loadSettings } from "@/lib/config/settings";
import { supabaseServer } from "@/lib/supabase/server";
import { Checklist } from "./checklist";

export default async function ExamDayPage() {
  const viewer = await requireViewer("student");
  const { examFacts } = await loadSettings();
  const supabase = await supabaseServer();
  const { data } = await supabase.from("checklist_ticks").select("item_id").eq("user_id", viewer.id);
  const done = (data ?? []).map((r) => r.item_id as string);
  const fmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl">Exam logistics</h1>
        <p className="mt-1 text-ink-2">{examFacts.prelims.format}</p>
      </header>

      <Card>
        <CardLabel>Key dates</CardLabel>
        <ul className="mt-2 space-y-2">
          {examFacts.milestones.map((m) => (
            <li key={m.id} className="flex justify-between gap-4 text-sm">
              <span>{m.label}</span>
              <span className="text-right tabular-nums text-ink-2">
                {fmt.format(new Date(m.at))}
                {m.tentative && " (tentative)"}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-3">
          Always confirm on{" "}
          <a className="underline" href={examFacts.verifyAt} target="_blank" rel="noreferrer">
            {examFacts.verifyAt.replace("https://", "")}
          </a>
          . Last checked {examFacts.lastReviewed}.
        </p>
      </Card>

      {(
        [
          ["Before the exam", checklists.logistics],
          ["Stationery kit", checklists.kit],
          ["On the day", checklists.examDay],
        ] as const
      ).map(([title, items]) => (
        <Card key={title}>
          <CardLabel>{title}</CardLabel>
          <Checklist items={[...items]} done={done} />
        </Card>
      ))}
    </div>
  );
}
