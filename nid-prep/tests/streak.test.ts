import { describe, expect, it } from "vitest";
import { currentStreak } from "@/lib/plan/streak";
import { currentStep } from "@/lib/plan/steps";

describe("streak", () => {
  it("counts back from today or yesterday", () => {
    expect(currentStreak(new Set([1, 2, 3]), 3)).toBe(3);
    expect(currentStreak(new Set([1, 2, 3]), 4)).toBe(3); // today not done yet
    expect(currentStreak(new Set([1, 3]), 3)).toBe(1);
    expect(currentStreak(new Set(), 5)).toBe(0);
  });
  it("skips free days without breaking", () => {
    expect(currentStreak(new Set([48, 50 - 0 + 1]), 51, new Set([49, 50]))).toBe(2);
  });
});

describe("steps", () => {
  it("finds the current step", () => {
    expect(currentStep({})).toBe("warmup");
    expect(currentStep({ warmup: "x", test: "x" })).toBe("result");
    expect(currentStep({ warmup: "x", test: "x", result: "x", homework: "x", task: "x", reflection: "x" })).toBeNull();
  });
});
