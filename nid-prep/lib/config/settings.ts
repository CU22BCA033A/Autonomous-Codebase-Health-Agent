import "server-only";
import { cache } from "react";
import { supabaseServer } from "@/lib/supabase/server";
import { defaultExamFacts, defaultPhases } from "./defaults";
import { examFactsSchema, phasesConfigSchema, type ExamFacts, type PhasesConfig } from "./schemas";

export interface AppSettings {
  examFacts: ExamFacts;
  phases: PhasesConfig;
  mentorMessage: string | null;
}

/** Settings row overrides the /content defaults; invalid overrides fall back to defaults. */
export const loadSettings = cache(async (): Promise<AppSettings> => {
  const supabase = await supabaseServer();
  const { data } = await supabase.from("settings").select("exam_facts, phases, mentor_message").eq("id", 1).maybeSingle();
  const facts = examFactsSchema.safeParse(data?.exam_facts);
  const phases = phasesConfigSchema.safeParse(data?.phases);
  return {
    examFacts: facts.success ? facts.data : defaultExamFacts,
    phases: phases.success ? phases.data : defaultPhases,
    mentorMessage: (data?.mentor_message as string | null) ?? null,
  };
});
