import { describe, expect, it } from "vitest";
import {
  dayWords,
  finishedNow,
  phaseDueWords,
  phaseLine,
  phaseOf,
  phasePlanOf,
  phaseStatus,
  runningB,
  spreadWeekly,
  stepsBetween,
  stepWords,
  tickedStep,
  weekOf,
  weeksAfter,
} from "./phase";

const who = { uid: "u1", name: "Sam Lee" };
const names: Record<string, string> = { press: "Leg Press", curl: "Leg Curl", ohp: "Overhead Press", fly: "Chest/Pec Fly", add: "Hip Adduction", row: "Simple Row" };
const nameOf = (id: string) => names[id] ?? id;

describe("days", () => {
  it("finds the Monday of a week, whatever the time zone", () => {
    expect(weekOf("2026-10-19")).toBe("2026-10-19"); // a Monday
    expect(weekOf("2026-10-25")).toBe("2026-10-19"); // the Sunday after
    expect(weekOf("2026-10-21")).toBe("2026-10-19");
    expect(weeksAfter("2026-10-19", 2)).toBe("2026-11-02");
    expect(dayWords("2026-11-02")).toBe("Nov 2");
  });
});

describe("stepsBetween", () => {
  it("pairs what leaves with what joins as swaps, in order", () => {
    expect(stepsBetween(["add", "press", "ohp", "row"], ["add", "curl", "fly", "row"])).toEqual([
      { from: "press", to: "curl" },
      { from: "ohp", to: "fly" },
    ]);
  });

  it("says a leftover as an addition or a machine taken out", () => {
    expect(stepsBetween(["add"], ["add", "curl"])).toEqual([{ to: "curl" }]);
    expect(stepsBetween(["add", "press"], ["add"])).toEqual([{ from: "press" }]);
  });

  it("has nothing to phase when only the order changed", () => {
    expect(stepsBetween(["a", "b"], ["b", "a"])).toEqual([]);
  });
});

describe("a plan", () => {
  const plan = phasePlanOf({ base: ["add", "press", "ohp", "row"], target: ["add", "curl", "fly", "row"], todayYmd: "2026-10-21", who });

  it("puts the steps one a week from this week, each owned by anyone", () => {
    expect(plan.steps.map((s) => s.week)).toEqual(["2026-10-19", "2026-10-26"]);
    expect(plan.steps.every((s) => !s.ownerName)).toBe(true);
    expect(plan.madeByName).toBe("Sam Lee");
  });

  it("runs the base until a step is ticked, then the target once every step is done", () => {
    expect(runningB(plan)).toEqual(["add", "press", "ohp", "row"]);
    const one = tickedStep(plan, 0, true, who, "2026-10-21");
    expect(runningB(one)).toEqual(["add", "curl", "ohp", "row"]);
    expect(one.steps[0]).toMatchObject({ doneAt: "2026-10-21", doneByUid: "u1", doneByName: "Sam Lee" });
    expect(runningB(finishedNow(one, who, "2026-10-22"))).toEqual(["add", "curl", "fly", "row"]);
  });

  it("puts an addition after the machine it follows in the target", () => {
    const p = phasePlanOf({ base: ["add", "row"], target: ["add", "curl", "row"], todayYmd: "2026-10-19", who });
    expect(runningB(tickedStep(p, 0, true, who, "2026-10-19"))).toEqual(["add", "curl", "row"]);
  });

  it("undoes a tick", () => {
    const back = tickedStep(tickedStep(plan, 0, true, who, "2026-10-21"), 0, false, who, "2026-10-21");
    expect(back.steps[0].doneAt).toBeUndefined();
    expect(runningB(back)).toEqual(plan.base);
  });

  it("spreads the weeks again", () => {
    expect(spreadWeekly(plan.steps, "2026-11-04").map((s) => s.week)).toEqual(["2026-11-02", "2026-11-09"]);
  });
});

describe("where it stands", () => {
  const plan = phasePlanOf({ base: ["press", "ohp"], target: ["curl", "fly"], todayYmd: "2026-10-19", who });

  it("is due in its week and behind once the week has passed", () => {
    expect(phaseStatus(plan, "2026-10-20")).toMatchObject({ done: 0, of: 2, due: true, behind: false });
    expect(phaseStatus(plan, "2026-10-27")).toMatchObject({ due: true, behind: true });
    const later = { ...plan, steps: plan.steps.map((s) => ({ ...s, week: "2026-11-02" })) };
    expect(phaseStatus(later, "2026-10-20")).toMatchObject({ due: false, behind: false });
  });

  it("says it in one line, with the owner", () => {
    const owned = { ...plan, steps: plan.steps.map((s, i) => (i === 1 ? { ...s, ownerName: "Sarah" } : s)) };
    const one = tickedStep(owned, 0, true, who, "2026-10-19");
    expect(phaseLine(one, "2026-10-27", nameOf)).toBe("Phasing in · 1 of 2 done · next: Chest/Pec Fly for Overhead Press, week of Oct 26 · Sarah");
    expect(phaseLine(one, "2026-11-03", nameOf)).toMatch(/· behind$/);
    expect(phaseLine(finishedNow(one, who, "2026-10-28"), "2026-10-28", nameOf)).toBe("Phased in · all 2 done");
  });

  it("names a step", () => {
    expect(stepWords({ from: "press", to: "curl" }, nameOf)).toBe("Leg Curl for Leg Press");
    expect(stepWords({ to: "curl" }, nameOf)).toBe("Add Leg Curl");
    expect(stepWords({ from: "press" }, nameOf)).toBe("Take out Leg Press");
  });
});

describe("phaseDueWords", () => {
  const plan = phasePlanOf({ base: ["press"], target: ["curl"], todayYmd: "2026-10-26", who });
  it("says nothing before the step's week, then due, then behind", () => {
    expect(phaseDueWords(plan, "2026-10-20", nameOf)).toBeNull();
    expect(phaseDueWords(plan, "2026-10-28", nameOf)).toBe("Routine B · Leg Curl for Leg Press is due this week · Anyone");
    expect(phaseDueWords(plan, "2026-11-03", nameOf)).toBe("Routine B · Leg Curl for Leg Press was due the week of Oct 26 · Anyone · behind");
    expect(phaseDueWords(finishedNow(plan, who, "2026-10-28"), "2026-11-03", nameOf)).toBeNull();
  });
});

describe("phaseOf", () => {
  it("reads a stored plan back, and skips what isn't usable", () => {
    const stored = phasePlanOf({ base: ["press"], target: ["curl"], todayYmd: "2026-10-19", who });
    expect(phaseOf(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
    expect(phaseOf({ base: ["a"], target: ["b"], madeByUid: "u", steps: [{ week: "2026-10-19" }, { from: "a", to: "b", week: "2026-10-19" }] })?.steps).toHaveLength(1);
    expect(phaseOf(null)).toBeNull();
    expect(phaseOf({ base: "a" })).toBeNull();
  });
});
