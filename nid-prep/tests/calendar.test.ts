import { describe, expect, it } from "vitest";
import { defaultExamFacts, defaultPhases } from "@/lib/config/defaults";
import { dateForDay, dayKind, dayNumberFor, istDateString, nextMilestone, phaseForDay, weekdayOf } from "@/lib/plan/calendar";

describe("calendar", () => {
  it("maps the default start date to Day 1 and Prelims to Day 50", () => {
    expect(dayNumberFor("2026-11-01", defaultPhases.startDate)).toBe(1);
    expect(dayNumberFor("2026-12-20", defaultPhases.startDate)).toBe(50);
    expect(dateForDay(100, defaultPhases.startDate)).toBe("2027-02-08");
  });

  it("knows weekdays", () => {
    expect(weekdayOf("2026-12-20")).toBe(0); // Prelims is a Sunday
    expect(weekdayOf("2026-11-01")).toBe(0);
  });

  it("assigns phases and day kinds", () => {
    expect(phaseForDay(1, defaultPhases)?.id).toBe("P1");
    expect(phaseForDay(45, defaultPhases)?.id).toBe("P2");
    expect(dayKind(50, defaultPhases)).toBe("exam");
    expect(dayKind(49, defaultPhases)).toBe("rest");
    expect(dayKind(46, defaultPhases)).toBe("mock");
    expect(dayKind(22, defaultPhases)).toBe("mock"); // Sunday 22 Nov in P2
    expect(dayKind(23, defaultPhases)).toBe("study");
    expect(dayKind(0, defaultPhases)).toBe("before-start");
    expect(dayKind(101, defaultPhases)).toBe("after-plan");
  });

  it("converts to IST dates", () => {
    expect(istDateString(new Date("2026-11-01T20:00:00Z"))).toBe("2026-11-02");
  });

  it("finds the next milestone", () => {
    expect(nextMilestone(defaultExamFacts.milestones, new Date("2026-10-28T00:00:00Z"))?.id).toBe("application");
    expect(nextMilestone(defaultExamFacts.milestones, new Date("2026-12-15T00:00:00Z"))?.id).toBe("prelims");
  });
});
