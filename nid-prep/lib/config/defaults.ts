import examFactsJson from "@/content/exam-facts.json";
import phasesJson from "@/content/phases.json";
import { examFactsSchema, phasesConfigSchema, type ExamFacts, type PhasesConfig } from "./schemas";

/** Defaults shipped in /content. The mentor can override them via the `settings` table. */
export const defaultExamFacts: ExamFacts = examFactsSchema.parse(examFactsJson);
export const defaultPhases: PhasesConfig = phasesConfigSchema.parse(phasesJson);
