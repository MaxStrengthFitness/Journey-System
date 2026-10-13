import { describe, expect, it } from "vitest";
import {
  DEFAULTS,
  FOCUS_KINDS,
  MIN_SCALE,
  MODULE_IDS,
  ROWS,
  SHEET,
  availability,
  defaultModules,
  fitLine,
  fitPage,
  focusLine,
  focusOf,
  pageOrder,
  pageRows,
  type PageContent,
  type PageFacts,
} from "./report-page";

const everything: PageFacts = {
  sessions: 213,
  statTiles: 4,
  accolades: 3,
  machines: 14,
  ratedPs: 4,
  bodyScans: 3,
  pulse: true,
  goals: true,
  plan: true,
  coach: true,
};

const content: PageContent = {
  narrativeChars: 160,
  machineRows: 14,
  machineNarrativeChars: 0,
  accoladeHero: [4, 11, 10],
  accoladeContext: [29, 35, 33],
  pNotes: [40, 32, 55, 34],
  pulseLines: [40, 95],
  goals: { why: 42, last: 16, lastNote: 32, next: 44 },
  planItems: [39, 48, 45],
  coachChars: 140,
  hasFocusLine: true,
};

describe("the focus", () => {
  it("reads a stored focus, and refuses one that isn't (an old report, a custom goal with no words)", () => {
    expect(focusOf({ kind: "body" })).toEqual({ kind: "body" });
    expect(focusOf({ kind: "custom", words: "  Hike the Camino in May " })).toEqual({ kind: "custom", words: "Hike the Camino in May" });
    expect(focusOf({ kind: "custom", words: "  " })).toBe(null);
    expect(focusOf({ kind: "weight-loss" })).toBe(null);
    expect(focusOf(undefined)).toBe(null);
  });

  it("says a custom goal in the trainer's words, and any other focus by its name", () => {
    expect(focusLine({ kind: "custom", words: "Hike the Camino in May" })).toBe("Hike the Camino in May");
    expect(focusLine({ kind: "everyday" })).toBe("Everyday strength and independence");
    expect(focusLine({ kind: "goal", words: "Leg Press 300" })).toBe("A goal to hit: Leg Press 300");
    expect(focusLine(null)).toBe(null);
  });
});

describe("the modules", () => {
  it("never offers a module with nothing real to say, and says why", () => {
    const a = availability({ ...everything, bodyScans: 0, pulse: false, accolades: 0, ratedPs: 0 });
    expect(a.body).toEqual({ has: false, why: "No InBody scans on file." });
    expect(a.pulse.has).toBe(false);
    expect(a.accolades.has).toBe(false);
    expect(a.fourps.has).toBe(false);
    expect(a.machines.has).toBe(true);
  });

  it("calls a read still in flight reading, never missing", () => {
    const a = availability({ ...everything, bodyScans: null, pulse: null });
    expect(a.body).toMatchObject({ has: false, reading: true });
    expect(a.pulse).toMatchObject({ has: false, reading: true });
  });

  it("puts every module on every focus's page exactly once, and every default on it", () => {
    for (const f of FOCUS_KINDS) {
      expect([...pageOrder(f)].sort()).toEqual([...MODULE_IDS].sort());
      for (const m of DEFAULTS[f]) expect(pageOrder(f)).toContain(m);
      for (const row of ROWS[f]) expect(row.length).toBeLessThanOrEqual(2);
    }
  });

  it("leads each focus with its own proof", () => {
    expect(pageOrder("body")[0]).toBe("body");
    expect(pageOrder("everyday").slice(0, 2)).toEqual(["thanks", "pulse"]);
    expect(pageOrder("pain-free").slice(0, 3)).toEqual(["thanks", "pulse", "fourps"]);
    expect(pageOrder("goal").slice(0, 3)).toEqual(["thanks", "stats", "accolades"]);
  });

  it("ticks the focus's defaults the data has, in page order", () => {
    const a = availability({ ...everything, bodyScans: 0 });
    expect(defaultModules("body", a)).toEqual(["thanks", "machines", "accolades", "goals", "plan", "coach"]);
    expect(defaultModules("everyday", availability(everything))).toEqual(["thanks", "pulse", "machines", "goals", "plan", "coach"]);
  });

  it("prints only ticked modules the data still has, pairing side by side only what both print", () => {
    const a = availability({ ...everything, ratedPs: 0 });
    const rows = pageRows("goal", ["thanks", "machines", "fourps", "plan", "coach"], a);
    expect(rows).toEqual([["thanks"], ["machines"], ["plan", "coach"]]);
  });
});

describe("one page", () => {
  it("fits A's everything on one sheet, condensed, printed no smaller than the least it shrinks to", () => {
    const rows = pageRows("goal", [...MODULE_IDS], availability(everything));
    const fit = fitPage(rows, content);
    expect(fit.density).toBe("condensed");
    expect(fit.used * fit.scale).toBeLessThanOrEqual(SHEET.height + 0.5);
    expect(fit.scale).toBeGreaterThanOrEqual(MIN_SCALE);
  });

  it("gives a shorter page room (a newer client: the thank-you, the machines, the goals)", () => {
    const facts = { ...everything, statTiles: 0, bodyScans: 0, accolades: 0, ratedPs: 0, pulse: false, plan: false, coach: false };
    const rows = pageRows("everyday", defaultModules("everyday", availability(facts)), availability(facts));
    expect(rows).toEqual([["thanks"], ["machines"], ["goals"]]);
    const fit = fitPage(rows, { ...content, machineRows: 5 });
    expect(fit).toMatchObject({ density: "roomy", scale: 1 });
    expect(fitLine(fit)).toBe("Fits on one page, with room to spare.");
  });

  it("says how much is too much, and never calls an over-full page one page", () => {
    const rows = pageRows("goal", [...MODULE_IDS], availability(everything));
    const fit = fitPage(rows, { ...content, narrativeChars: 2400, coachChars: 2400, pulseLines: [900, 900], planItems: [400, 400, 400] });
    expect(fit.density).toBe(null);
    expect(fit.over).toBeGreaterThan(0);
    expect(fitLine(fit)).toMatch(/^Runs onto a second page, about \d+ lines too long/);
  });

  it("says a page that prints a little smaller does so", () => {
    expect(fitLine({ density: "condensed", scale: 0.94, over: 0 })).toBe("Fits on one page, printed a little smaller (94%).");
    expect(fitLine({ density: "condensed", scale: 1, over: 0 })).toBe("Fits on one page.");
  });
});
