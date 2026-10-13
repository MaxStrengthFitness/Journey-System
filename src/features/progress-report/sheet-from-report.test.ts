import { describe, expect, it } from "vitest";
import { chosenFocus, planSheet, reportFocus } from "./sheet-from-report";
import { BODY, EVERYDAY, FULL, NEW_CLIENT, OVERFULL, baseReport, choiceFor, inputsFor } from "./sheet-fixtures";
import { emptyAssessment } from "../subjective-report/scoring";

describe("a report as the one-page sheet", () => {
  it("prints everything ticked on A, condensed, with the biggest machines and how many there are", () => {
    const p = planSheet(FULL);
    expect(p.rows.flat()).toEqual(["thanks", "stats", "accolades", "machines", "fourps", "body", "pulse", "goals", "plan", "coach"]);
    expect(p.fit.density).toBe("condensed");
    expect(p.model.machines?.rows).toHaveLength(8);
    expect(p.model.machines?.note).toBe("8 of 14 machines shown");
    // AJ's "2a": with sets whose reps were never written down, the recorded ones.
    expect(p.model.stats?.map((s) => s.label)).toEqual(["Volume (recorded)", "Reps (recorded)", "Top-quality reps", "Average rest"]);
    expect(p.model.focusLine).toBe("A goal to hit");
  });

  it("leaves out what a client hasn't got, and says why to the trainer (C, everyday strength)", () => {
    const p = planSheet(EVERYDAY);
    expect(p.rows.slice(0, 3)).toEqual([["thanks"], ["pulse"], ["machines"]]);
    for (const m of ["body", "accolades", "fourps"]) expect(p.rows.flat()).not.toContain(m);
    expect(p.avail.body.why).toBe("No InBody scans on file.");
    expect(p.fit.density).toBe("roomy");
    expect(p.model.machines?.title).toBe("Stronger where it counts");
    expect(p.model.pulse?.title).toBe("How you are feeling");
  });

  it("leads body composition with InBody, and never calls a change inside the scanner's variation progress (D)", () => {
    const p = planSheet(BODY);
    expect(p.rows[0]).toEqual(["body"]);
    const cells = Object.fromEntries((p.model.body?.cells ?? []).map((c) => [c.label, c]));
    expect(Object.keys(cells)).toEqual(["Body fat", "Fat mass", "Muscle", "Weight"]);
    expect(cells["Body fat"]).toMatchObject({ now: expect.stringContaining("28.1"), tone: "ok" });
    expect(cells["Fat mass"].tone).toBe("ok");
    // +2.1 lb of muscle is inside the studio's 3.5 lb: said as about the same, never as a gain.
    expect(cells.Muscle).toMatchObject({ change: "about the same", tone: "plain" });
    expect(p.model.body?.title).toBe("Your body, January 2026 to October 2026");
  });

  it("makes up nothing for a brand-new client: no quote, no tiles, no plan, no closing note", () => {
    const p = planSheet(NEW_CLIENT);
    expect(p.model.thanks?.quote).toBe("");
    expect(p.avail.stats.has).toBe(false);
    expect(p.avail.plan.has).toBe(false);
    expect(p.avail.coach.has).toBe(false);
    expect(p.avail.pulse).toMatchObject({ has: false, why: "No finalized Pulse with answers yet." });
    expect(p.rows.flat()).toEqual(["thanks", "goals"]);
    expect(p.model.subline).toContain("First report");
  });

  it("says when the trainer has written more than one page holds", () => {
    const p = planSheet(OVERFULL);
    expect(p.fit.density).toBe(null);
    expect(p.fit.over).toBeGreaterThan(0);
  });

  it("never prints a focus nobody chose: the order is A goal to hit's, the line is empty", () => {
    const p = planSheet(inputsFor(baseReport({ focus: undefined })));
    expect(p.chosen).toBe(null);
    expect(p.focus).toEqual({ kind: "goal" });
    expect(p.model.focusLine).toBe(null);
    expect(chosenFocus({}, { trainingFocus: { kind: "custom", words: "  " } })).toBe(null);
  });

  it("brings in what was written after an early save, unless the trainer took it off", () => {
    const report = baseReport({ focus: { kind: "goal" }, pageChoice: { on: [], off: ["fourps"] } });
    const rows = planSheet(inputsFor(report)).rows.flat();
    expect(rows).toContain("coach");
    expect(rows).toContain("goals");
    expect(rows).not.toContain("fourps");
  });

  it("prints a Pulse the client answered even with no win to name, and none they didn't answer", () => {
    const first = { ...emptyAssessment(), answers: { ...emptyAssessment().answers, strengthConfidence_1: { value: 5 } } };
    const p = planSheet(inputsFor(baseReport({ focus: { kind: "everyday" } }), { pulse: { assessment: first, previous: null, date: "2026-10-06" } }));
    expect(p.avail.pulse.has).toBe(true);
    expect(p.model.pulse?.lines.length).toBeGreaterThan(0);
    expect(p.screen.pulse).not.toBe(null);
    const none = planSheet(inputsFor(baseReport(), { pulse: { assessment: { ...emptyAssessment(), coachSummary: "Only a summary." }, previous: null, date: "2026-10-06" } }));
    expect(none.avail.pulse.has).toBe(false);
  });

  it("carries every Blueprint line to the plan, the check-in day even with nothing else", () => {
    const report = baseReport({
      roadmap: { trackType: "goals", smartGoal: "Pulldown 150 by spring", emotionalAnchor: "Carry the grandkids", targetMachineId: "pd", goalActions: [], machinePlan: "" },
    });
    const p = planSheet(inputsFor(report, { machineName: (id) => (id === "pd" ? "Pulldown" : null) }));
    expect(p.screen.plan).toEqual(expect.arrayContaining(["Goal: Pulldown 150 by spring", "Why it matters: “Carry the grandkids”", "Target machine: Pulldown."]));
    const onlyCheckIn = baseReport({
      goals: { ...baseReport().goals!, checkpoints: [], followUpDate: "2027-01-11" },
      roadmap: { trackType: "maintenance", selectedHabits: [] },
    });
    const q = planSheet(inputsFor(onlyCheckIn));
    expect(q.avail.plan.has).toBe(true);
    expect(q.model.plan).toMatchObject({ items: [], checkIn: "Next check-in January 11, 2027" });
  });

  it("prints the thank-you alone when the session tile is off", () => {
    const report = baseReport({ attendance: { ...baseReport().attendance, toggles: { ...baseReport().attendance.toggles, totalSessions: false } } });
    const p = planSheet(inputsFor(report, { }));
    expect(p.rows.flat()).toContain("thanks");
    expect(p.model.thanks).toMatchObject({ sessions: null });
    expect(p.model.thanks?.quote).not.toBe("");
  });

  it("says nothing about the last report until it is known, and the studio's day for 'Since'", () => {
    const unknown = planSheet(inputsFor(baseReport(), { previousReportDay: "unknown" }));
    expect(unknown.model.subline).not.toContain("First report");
    expect(unknown.model.subline).not.toContain("Last report");
    // 7:30 PM Eastern on January 15 is already January 16 in UTC.
    const evening = planSheet(inputsFor(baseReport(), { joined: new Date("2024-01-16T00:30:00Z") }));
    expect(evening.model.subline).toContain("Since January 15, 2024");
  });

  it("prints with the report's own focus, else the client's, else a goal to hit", () => {
    expect(reportFocus({ focus: { kind: "body" } }, { trainingFocus: { kind: "everyday" } })).toEqual({ kind: "body" });
    expect(reportFocus({}, { trainingFocus: { kind: "pain-free" } })).toEqual({ kind: "pain-free" });
    expect(reportFocus({}, { trainingFocus: null })).toEqual({ kind: "goal" });
  });
});
