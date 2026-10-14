import { describe, expect, it } from "vitest";
import { clientWriteFor, planClient, type ClientNow, type PlanInput } from "./plan";
import { groupVisits } from "./visits";
import { machineResolver, type MapRow } from "./machine-map";
import { involvedMachines, logsAfter, sessionOutcome, totalsPlan, wasEdited, type StoredSession } from "./relabel";
import { plainFieldOps } from "../../lib/client-rollups";
import type { WorkoutLine } from "./records";

let row = 1;
function line(day: string, machine: string, order: number, weight: number | null, reps: number | null, nextWeight: number | null = null): WorkoutLine {
  row += 1;
  return { file: "w.xlsx", row, fmClientId: "FM-1", name: "Allan", day, machine, order, weight, reps, nextWeight, trainer: null, note: null, problems: [] };
}

const studioRow = (fmName: string, machineId: string): MapRow => ({
  studio: "S1",
  fmName,
  machineId,
  from: null,
  until: null,
  uses: 0,
  firstUsed: null,
  lastUsed: null,
  suggested: null,
  note: null,
});
const STUDIO: MapRow[] = [
  studioRow("Leg Curl", "m-leg-curl"),
  studioRow("Seated Dip", "m-dip"),
  studioRow("Comp. Row", "m-compound-row"),
  studioRow("Abs", "m-abs"),
  studioRow("Chest fly", "m-chest-fly"),
];
// Allan's export, Oct 13 2026: from Aug 24 2024 these names were on the wrong machines.
const ALLAN: MapRow[] = [
  { ...studioRow("Seated Dip", "m-compound-row"), client: "C1", from: "2024-08-24" },
  { ...studioRow("Comp. Row", "m-dip"), client: "C1", from: "2024-08-24" },
  { ...studioRow("Abs", "m-chest-fly"), client: "C1", from: "2024-08-24" },
  { ...studioRow("Chest fly", "m-pulldown"), client: "C1", from: "2024-08-24" },
];

const LINES = [
  // Before the names went wrong: left as they are.
  line("2024-08-20", "Leg Curl", 1, 80, 10),
  line("2024-08-20", "Seated Dip", 2, 99, 10),
  line("2024-08-20", "Abs", 3, 96, 11),
  // After: Seated Dip ↔ Comp. Row, "Abs" is the chest fly.
  line("2026-10-06", "Leg Curl", 1, 74, 8),
  line("2026-10-06", "Comp. Row", 2, 120, 8),
  line("2026-10-06", "Abs", 3, 46, null),
  line("2026-10-06", "Seated Dip", 4, 90, 8),
  line("2026-10-10", "Chest fly", 1, 160, 10, 166),
];

function planWith(rows: MapRow[], lines: WorkoutLine[] = LINES) {
  const resolve = machineResolver(rows);
  const input: PlanInput = {
    client: { docId: "C1", mindbodyClientId: "100003085", name: "Allan", homeStudioId: "S1", fmClientId: "FM-1" },
    visits: groupVisits(lines).visits,
    through: "2026-10-11",
    timeZone: "America/New_York",
    machineFor: (fm, day) => resolve("S1", fm, day, "C1"),
    perSide: () => false,
    journeyDays: new Set(),
    existing: new Map(),
    numberOffset: 0,
  };
  return planClient(input);
}

/** What Journey holds after an import with `rows`. */
function storedFrom(rows: MapRow[], lines: WorkoutLine[] = LINES): Map<string, StoredSession> {
  return new Map(
    planWith(rows, lines).sessions.map((s) => [s.id, { id: s.id, data: { ...s.data }, logs: s.logs.map((l) => ({ id: l.id, data: { ...l.data } })) }]),
  );
}

const oldPlan = planWith(STUDIO);
const newPlan = planWith([...STUDIO, ...ALLAN]);
const pairs = () => oldPlan.sessions.map((s, i) => ({ old: s, neu: newPlan.sessions[i] }));

describe("putting an imported visit's sets back on the right machines", () => {
  it("leaves a visit before the client's rows begin exactly as it is", () => {
    const stored = storedFrom(STUDIO);
    const { old, neu } = pairs()[0];
    expect(sessionOutcome(old, neu, stored.get(old.id)!)).toEqual({ kind: "same" });
  });

  it("moves each set to its machine, keeps its numbers and order, and rewrites the session's machines", () => {
    const stored = storedFrom(STUDIO);
    const { old, neu } = pairs()[1];
    const out = sessionOutcome(old, neu, stored.get(old.id)!);
    if (out.kind !== "change") throw new Error(out.kind);
    expect(out.sessionMachineIds).toEqual(["m-leg-curl", "m-dip", "m-chest-fly", "m-compound-row"]);
    expect(out.moves).toEqual([
      { day: "2026-10-06", from: "m-compound-row", to: "m-dip", weight: "120" },
      { day: "2026-10-06", from: "m-abs", to: "m-chest-fly", weight: "46" },
      { day: "2026-10-06", from: "m-dip", to: "m-compound-row", weight: "90" },
    ]);
    // The sets keep their ids' rule (session_machine) and their numbers.
    expect(out.set.map((l) => [l.id, l.data.weight, l.data.reps ?? null, l.data.repsNotRecorded ?? null])).toEqual([
      ["fm_C1_2026-10-06_m-dip", "120", "8", null],
      ["fm_C1_2026-10-06_m-chest-fly", "46", null, true],
      ["fm_C1_2026-10-06_m-compound-row", "90", "8", null],
    ]);
    // A swap reuses both ids, so only the third machine's old id goes.
    expect(out.remove).toEqual(["fm_C1_2026-10-06_m-abs"]);
  });

  it("is a no-op the second time: Journey already holds the new plan", () => {
    const stored = storedFrom([...STUDIO, ...ALLAN]);
    for (const { old, neu } of pairs()) expect(sessionOutcome(old, neu, stored.get(old.id)!)).toEqual({ kind: "same" });
  });

  it("leaves alone a visit someone edited, or whose sets in Journey are not what the import wrote", () => {
    const { old, neu } = pairs()[1];
    const edited = storedFrom(STUDIO).get(old.id)!;
    edited.data.editedAt = new Date();
    expect(sessionOutcome(old, neu, edited)).toMatchObject({ kind: "left", why: expect.stringMatching(/edited/) });
    expect(wasEdited({ editCount: 2 })).toBe(true);

    const changed = storedFrom(STUDIO).get(old.id)!;
    changed.logs[0].data.weight = "76";
    expect(sessionOutcome(old, neu, changed)).toMatchObject({ kind: "left", why: expect.stringMatching(/numbers/) });

    const missing = storedFrom(STUDIO).get(old.id)!;
    missing.logs.pop();
    expect(sessionOutcome(old, neu, missing)).toMatchObject({ kind: "left", why: expect.stringMatching(/not the ones the import wrote/) });
  });

  it("moves two swapped sets with the same numbers, so the order done stays right", () => {
    const twins = [line("2025-01-15", "Comp. Row", 1, 100, 10), line("2025-01-15", "Seated Dip", 2, 100, 10)];
    const old = planWith(STUDIO, twins).sessions[0];
    const neu = planWith([...STUDIO, ...ALLAN], twins).sessions[0];
    const out = sessionOutcome(old, neu, storedFrom(STUDIO, twins).get(old.id)!);
    if (out.kind !== "change") throw new Error(out.kind);
    expect(out.sessionMachineIds).toEqual(["m-dip", "m-compound-row"]);
    expect(out.set.map((l) => [l.machineId, l.data.suggestedOrder])).toEqual([
      ["m-dip", 1],
      ["m-compound-row", 2],
    ]);
    expect(out.remove).toEqual([]);
    expect(involvedMachines([{ old, neu }])).toEqual(["m-compound-row", "m-dip"]);
  });

  it("leaves a visit alone when a set carries something Journey added since the import (it would be lost)", () => {
    const { old, neu } = pairs()[1];
    const stored = storedFrom(STUDIO).get(old.id)!;
    stored.logs[1].data.notes = "felt strong";
    expect(sessionOutcome(old, neu, stored)).toMatchObject({ kind: "left", why: expect.stringMatching(/added since the import \(notes\)/) });
  });

  it("leaves a visit alone when the corrected table would add or drop a set, not only move one", () => {
    // Two FileMaker names on one Journey machine that day: the plan holds one back.
    const dropping = planWith([...STUDIO, { ...studioRow("Seated Dip", "m-leg-curl"), client: "C1", from: "2024-08-24" }]);
    const stored = storedFrom(STUDIO);
    const old = oldPlan.sessions[1];
    expect(sessionOutcome(old, dropping.sessions[1], stored.get(old.id)!)).toMatchObject({ kind: "left", why: expect.stringMatching(/add or drop/) });
  });

  it("gives the client's sets as Journey will hold them", () => {
    const stored = storedFrom(STUDIO);
    const { old, neu } = pairs()[1];
    const out = sessionOutcome(old, neu, stored.get(old.id)!);
    if (out.kind !== "change") throw new Error(out.kind);
    const after = logsAfter(stored.get(old.id)!.logs, [out]);
    expect(after.map((l) => [l.id, l.data.machineId, l.data.weight]).sort()).toEqual([
      ["fm_C1_2026-10-06_m-chest-fly", "m-chest-fly", "46"],
      ["fm_C1_2026-10-06_m-compound-row", "m-compound-row", "90"],
      ["fm_C1_2026-10-06_m-dip", "m-dip", "120"],
      ["fm_C1_2026-10-06_m-leg-curl", "m-leg-curl", "74"],
    ]);
  });
});

describe("last time and next time's weight after a relabel", () => {
  const now: ClientNow = {
    priorHistory: null,
    lastSessionDate: null,
    legacyFilemakerId: null,
    completedSessions: 0,
    trainerTally: null,
    topTrainerId: null,
    machineStats: null,
    lastMetricDay: () => null,
  };
  const writeOf = (plan: typeof oldPlan) => clientWriteFor(plan.sessions, plan.firstDays, now, plainFieldOps, { fmClientId: "FM-1", wholeStory: false });
  const oldWrite = writeOf(oldPlan);
  const newWrite = writeOf(newPlan);
  const involved = involvedMachines(pairs());

  it("involves every machine a set moves off or onto, a swap's two included (their ids are reused)", () => {
    expect(involved).toEqual(["m-abs", "m-chest-fly", "m-compound-row", "m-dip", "m-pulldown"]);
  });
  const isImportedSession = (id: string) => id.startsWith("fm_");
  // What the import left on file under the old names.
  const metricsOnFile = Object.fromEntries(
    involved.flatMap((m) => {
      const v = oldWrite.totals[`currentMachineMetrics.${m}`];
      return v ? [[m, v as Record<string, unknown>]] : [];
    }),
  );
  const settingsOnFile = new Map(oldWrite.settings.map((s) => [s.machineId, { currentWeight: s.currentWeight } as Record<string, unknown>]));

  it("works last time out again from the corrected sets, and takes it off a machine left with none", () => {
    const plan = totalsPlan({ involved, oldWrite, newWrite, metricsOnFile, settingsOnFile, journeyMachines: new Set(), isImportedSession });
    expect(plan.metrics["m-dip"]).toMatchObject({ weight: "120", lastSessionId: "fm_C1_2026-10-06" });
    expect(plan.metrics["m-compound-row"]).toMatchObject({ weight: "90" });
    expect(plan.metrics["m-chest-fly"]).toMatchObject({ weight: "46" });
    expect(plan.metrics["m-pulldown"]).toMatchObject({ weight: "160", lastSessionId: "fm_C1_2026-10-10" });
    // Abs was done only before Aug 24 2024: its last time is that day's, which the import never had to change.
    expect(plan.metrics["m-abs"]).toMatchObject({ weight: "96", lastSessionId: "fm_C1_2024-08-20" });
  });

  it("sets next time's weight from the corrected sets where the import's still stands", () => {
    const plan = totalsPlan({ involved, oldWrite, newWrite, metricsOnFile, settingsOnFile, journeyMachines: new Set(), isImportedSession });
    const by = new Map(plan.settings.map((s) => [s.machineId, s.currentWeight]));
    expect(by.get("m-pulldown")).toBe(166);
    expect(by.get("m-chest-fly")).toBe(46);
    expect(by.get("m-abs")).toBe(96);
    expect(by.get("m-dip")).toBe(120);
    expect(by.get("m-compound-row")).toBe(90);
  });

  it("never writes over what a person set after the import, or what Journey's own sessions set", () => {
    const personal = new Map(settingsOnFile);
    personal.set("m-pulldown", { currentWeight: 170 });
    const ownMetric = { ...metricsOnFile, "m-dip": { weight: "122", lastSessionId: "JOURNEY-1" } };
    const plan = totalsPlan({
      involved,
      oldWrite,
      newWrite,
      metricsOnFile: ownMetric,
      settingsOnFile: personal,
      journeyMachines: new Set(["m-dip"]),
      isImportedSession,
    });
    expect(plan.metrics["m-dip"]).toBeUndefined();
    expect(plan.settings.find((s) => s.machineId === "m-dip")).toBeUndefined();
    expect(plan.settings.find((s) => s.machineId === "m-pulldown")).toBeUndefined();
    expect(plan.kept).toEqual(
      expect.arrayContaining([
        { machineId: "m-dip", what: "last time (from a Journey session)" },
        { machineId: "m-pulldown", what: "next time's weight 170 (set after the import)" },
      ]),
    );
  });

  it("corrects the import's starting weight even on a machine done in Journey since (Finish never writes over one)", () => {
    const whole = (plan: typeof oldPlan) => clientWriteFor(plan.sessions, plan.firstDays, now, plainFieldOps, { fmClientId: "FM-1", wholeStory: true });
    const oldWhole = whole(oldPlan);
    const newWhole = whole(newPlan);
    // The import took Chest Fly's start from the Pulldown's first day (160); its own first day was 46.
    expect(oldWhole.settings.find((s) => s.machineId === "m-chest-fly")?.startingWeight).toBe(160);
    const plan = totalsPlan({
      involved,
      oldWrite: oldWhole,
      newWrite: newWhole,
      metricsOnFile,
      settingsOnFile: new Map([["m-chest-fly", { currentWeight: 48, startingWeight: 160 }]]),
      journeyMachines: new Set(["m-chest-fly"]),
      isImportedSession,
    });
    expect(plan.settings.find((s) => s.machineId === "m-chest-fly")).toEqual({ machineId: "m-chest-fly", day: "2026-10-06", startingWeight: 46, startingDay: "2026-10-06" });
    expect(plan.kept).toContainEqual({ machineId: "m-chest-fly", what: "next time's weight (the client has done it in Journey since)" });
  });

  it("takes last time and the import's next weight off a machine left with no imported set", () => {
    // Every day's "Abs" was really the chest fly: Abs has no set of its own once the names are right.
    const allDays: MapRow[] = [
      { ...studioRow("Abs", "m-chest-fly"), client: "C1" },
      { ...studioRow("Chest fly", "m-pulldown"), client: "C1" },
    ];
    const neu = planWith([...STUDIO, ...allDays]);
    const both = oldPlan.sessions.map((s, i) => ({ old: s, neu: neu.sessions[i] }));
    const plan = totalsPlan({
      involved: involvedMachines(both),
      oldWrite,
      newWrite: writeOf(neu),
      metricsOnFile,
      settingsOnFile,
      journeyMachines: new Set(),
      isImportedSession,
    });
    expect(plan.metrics["m-abs"]).toBe(null);
    expect(plan.settings.find((s) => s.machineId === "m-abs")).toMatchObject({ currentWeight: null });
  });
});

describe("a client's row with no Journey machine yet", () => {
  it("holds the entry back rather than falling through to the studio's row", () => {
    const resolve = machineResolver([...STUDIO, { ...studioRow("Abs", "m-abs"), client: "C3", machineId: null }]);
    expect(resolve("S1", "Abs", "2025-01-01", "C3")).toBe(null);
    expect(resolve("S1", "Abs", "2025-01-01", "C2")).toBe("m-abs");
  });
});
