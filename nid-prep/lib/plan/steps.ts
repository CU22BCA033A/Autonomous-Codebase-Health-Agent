export const DAY_STEPS = [
  { id: "warmup", label: "Morning warm-up", detail: "Tip of the day + 5 visual puzzles", minutes: 5 },
  { id: "test", label: "Daily test", detail: "Quick items, creative answers and studio tasks", minutes: 70 },
  { id: "result", label: "Result & explanations", detail: "See what went well and what to fix", minutes: 10 },
  { id: "homework", label: "Homework", detail: "Re-attempt mistakes + 2 new variants each", minutes: 15 },
  { id: "task", label: "Studio challenge", detail: "Today's bigger drawing / making task", minutes: 30 },
  { id: "reflection", label: "Reflection", detail: "Mood, sleep, one thing you learned", minutes: 1 },
] as const;

export type StepId = (typeof DAY_STEPS)[number]["id"];
export type StepState = Partial<Record<StepId, string>>; // step → ISO timestamp when done

/** The first step not yet done, or null when the day is complete. */
export function currentStep(state: StepState): StepId | null {
  return DAY_STEPS.find((s) => !state[s.id])?.id ?? null;
}
