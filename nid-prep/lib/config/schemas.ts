import { z } from "zod";

export const milestoneSchema = z.object({
  id: z.string(),
  label: z.string(),
  at: z.string().datetime({ offset: true }),
  note: z.string().optional(),
  tentative: z.boolean().optional(),
});

export const examFactsSchema = z.object({
  exam: z.string(),
  verifyAt: z.string().url(),
  lastReviewed: z.string(),
  milestones: z.array(milestoneSchema).min(1),
  prelims: z.object({
    durationMin: z.number().int().positive(),
    totalMarks: z.number().int().positive(),
    format: z.string(),
    weightInFinalMerit: z.string(),
  }),
  mains: z.object({ components: z.array(z.string()) }),
});

export const mixSchema = z.object({
  quick: z.number().int().min(0),
  short: z.number().int().min(0),
  studio: z.number().int().min(0),
});

export const phaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  fromDay: z.number().int().min(1),
  toDay: z.number().int().min(1),
  focus: z.string(),
  minItems: z.number().int().min(0),
  mix: mixSchema,
  mock: z
    .object({
      weekday: z.number().int().min(0).max(6),
      kind: z.enum(["mini", "full"]),
      durationMin: z.number().int().positive(),
    })
    .optional(),
  restDays: z.array(z.number().int()).optional(),
  fullMockDays: z.array(z.number().int()).optional(),
});

export const phasesConfigSchema = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    totalDays: z.number().int().positive(),
    targetReadiness: z.number().min(0).max(100),
    phases: z.array(phaseSchema).min(1),
  })
  .superRefine((cfg, ctx) => {
    // Phases must tile days 1..totalDays with no gaps or overlaps.
    const sorted = [...cfg.phases].sort((a, b) => a.fromDay - b.fromDay);
    let expected = 1;
    for (const p of sorted) {
      if (p.fromDay !== expected || p.toDay < p.fromDay) {
        ctx.addIssue({ code: "custom", message: `Phase ${p.id} must start on day ${expected}` });
        return;
      }
      expected = p.toDay + 1;
    }
    if (expected !== cfg.totalDays + 1) {
      ctx.addIssue({ code: "custom", message: `Phases must end on day ${cfg.totalDays}` });
    }
  });

export type ExamFacts = z.infer<typeof examFactsSchema>;
export type Milestone = z.infer<typeof milestoneSchema>;
export type Phase = z.infer<typeof phaseSchema>;
export type PhasesConfig = z.infer<typeof phasesConfigSchema>;
export type Mix = z.infer<typeof mixSchema>;
