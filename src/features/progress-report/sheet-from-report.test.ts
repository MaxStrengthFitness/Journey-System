import { describe, expect, it } from "vitest";
import { planSheet, reportFocus } from "./sheet-from-report";
import { BODY, EVERYDAY, FULL, NEW_CLIENT, OVERFULL } from "./sheet-fixtures";

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

  it("prints with the report's own focus, else the client's, else a goal to hit", () => {
    expect(reportFocus({ focus: { kind: "body" } }, { trainingFocus: { kind: "everyday" } })).toEqual({ kind: "body" });
    expect(reportFocus({}, { trainingFocus: { kind: "pain-free" } })).toEqual({ kind: "pain-free" });
    expect(reportFocus({}, { trainingFocus: null })).toEqual({ kind: "goal" });
  });
});
