import { describe, expect, it } from "vitest";
import { clientWriteFor, numberOffsetFor, planClient, sessionIdFor, visitInstant, type ClientNow, type PlanInput, type PlannedSession } from "./plan";
import { groupVisits } from "./visits";
import { plainFieldOps } from "../../lib/client-rollups";
import type { WorkoutLine } from "./records";

let row = 1;
function line(day: string, machine: string, order: number, weight: number | null, reps: number | null, nextWeight: number | null = null, trainer: string | null = null): WorkoutLine {
  row += 1;
  return { file: "w.xlsx", row, fmClientId: "FM-1", name: "Test Client", day, machine, order, weight, reps, nextWeight, trainer, note: null, problems: [] };
}

const MAP: Record<string, string> = {
  "Leg Press Imag.": "m-leg-press",
  "Comp. Row": "m-compound-row",
  Pullover: "m-pullover",
  "Torso Rotation": "m-torso-rotation",
  Lumbar: "m-lumbar",
  Abs: "skip",
};

function input(lines: WorkoutLine[], over: Partial<PlanInput> = {}): PlanInput {
  return {
    client: { docId: "100000001", mindbodyClientId: "100000001", name: "Test Client", homeStudioId: "S1", fmClientId: "FM-1" },
    visits: groupVisits(lines).visits,
    through: "2026-10-11",
    timeZone: "America/New_York",
    machineFor: (fm) => MAP[fm] ?? null,
    perSide: (id) => id === "m-torso-rotation",
    journeyDays: new Set(),
    existing: new Map(),
    numberOffset: 0,
    ...over,
  };
}

describe("the instant a visit is filed under", () => {
  it("is noon on the visit's own day in the studio's zone, in summer and in winter", () => {
    expect(visitInstant("2026-07-15", "America/New_York").toISOString()).toBe("2026-07-15T16:00:00.000Z");
    expect(visitInstant("2026-01-15", "America/New_York").toISOString()).toBe("2026-01-15T17:00:00.000Z");
    expect(visitInstant("2026-01-15", "America/New_York", 3).toISOString()).toBe("2026-01-15T17:00:03.000Z");
  });
});

describe("a client's visits as Journey sessions", () => {
  const lines = [
    line("2026-03-19", "Leg Press Imag.", 1, 80, 12, 86),
    line("2026-03-19", "Comp. Row", 2, 26, null),
    line("2026-03-19", "Abs", 3, 40, 8),
    line("2026-03-26", "Leg Press Imag.", 1, 86, 0, 0),
    line("2026-03-26", "Pullover", 2, 88, 90),
    line("2026-03-26", "Torso Rotation", 3, 20, 7.6),
    line("2026-03-26", "Lumbar", 4, 44, 25),
  ];

  it("files each visit under a derived id, Completed, at the home studio, numbered in date order, its day as its end", () => {
    const plan = planClient(input(lines));
    expect(plan.sessions.map((s) => [s.id, s.number])).toEqual([
      ["fm_100000001_2026-03-19", 1],
      ["fm_100000001_2026-03-26", 2],
    ]);
    expect(plan.sessions[0].data).toMatchObject({
      clientId: "100000001",
      hostedAtStudioId: "S1",
      clientHomeStudioId: "S1",
      isCrossTrain: false,
      status: "Completed",
      date: "2026-03-19",
      sessionNumber: 1,
      trainerInitials: "",
      legacy_filemaker_id: "fm:FM-1:2026-03-19",
      rollupCounted: true,
      countsTowardTotals: true,
      sessionMachineIds: ["m-leg-press", "m-compound-row"],
    });
    expect((plan.sessions[0].data.createdAt as Date).toISOString()).toBe("2026-03-19T16:00:00.000Z");
    // The briefing's "Last session" reads endTime.
    expect(plan.sessions[0].data.endTime).toEqual(plan.sessions[0].data.createdAt);
  });

  it("writes each entry the way the floor would, one side at a time where the machine is", () => {
    const [first, second] = planClient(input(lines)).sessions;
    const logs = (s: PlannedSession) => Object.fromEntries(s.logs.map((l) => [l.id, l.data]));
    expect(logs(first)["fm_100000001_2026-03-19_m-leg-press"]).toMatchObject({ weight: "80", reps: "12", outcome: "performed", machineSettings: {}, suggestedOrder: 1 });
    // A weight with no reps: done, the count not written down.
    expect(logs(first)["fm_100000001_2026-03-19_m-compound-row"]).toMatchObject({ weight: "26", outcome: "performed", repsNotRecorded: true });
    expect(logs(first)["fm_100000001_2026-03-19_m-compound-row"]).not.toHaveProperty("reps");
    // A 0: not performed.
    expect(logs(second)["fm_100000001_2026-03-26_m-leg-press"]).toMatchObject({ weight: "86", outcome: "skipped", skipReason: "unknown" });
    // Seconds: a timed hold.
    expect(logs(second)["fm_100000001_2026-03-26_m-pullover"]).toMatchObject({ seconds: "90", isTSC: true, isStaticHold: true, outcome: "performed" });
    // Left.right on Torso Rotation: two logs.
    expect(logs(second)["fm_100000001_2026-03-26_m-torso-rotation_Left"]).toMatchObject({ reps: "7", side: "Left" });
    expect(logs(second)["fm_100000001_2026-03-26_m-torso-rotation_Right"]).toMatchObject({ reps: "6", side: "Right" });
  });

  it("holds back what it can't read and what the table says to skip, and imports the rest of the visit", () => {
    const plan = planClient(input(lines));
    expect(plan.held).toEqual([
      { day: "2026-03-19", machine: "Abs", why: "the machine table says skip" },
      { day: "2026-03-26", machine: "Lumbar", why: "25 is too many reps and too short for a timed hold" },
    ]);
    expect(plan.sessions[1].data.sessionMachineIds).toEqual(["m-leg-press", "m-pullover", "m-torso-rotation"]);
  });

  it("leaves out visits after the last day and on a day Journey has, numbering the rest with no gap", () => {
    const plan = planClient(
      input(
        [
          line("2026-01-05", "Comp. Row", 1, 20, 8),
          line("2026-01-12", "Comp. Row", 1, 22, 8),
          line("2026-01-15", "Comp. Row", 1, 22, 9),
          line("2026-01-19", "Comp. Row", 1, 22, 9),
          line("2026-10-12", "Comp. Row", 1, 30, null),
        ],
        { journeyDays: new Set(["2026-01-15"]) },
      ),
    );
    expect(plan.sessions.map((s) => [s.day, s.number])).toEqual([
      ["2026-01-05", 1],
      ["2026-01-12", 2],
      ["2026-01-19", 3],
    ]);
    expect(plan.skipped.map((s) => s.day)).toEqual(["2026-01-15", "2026-10-12"]);
  });

  it("makes the client wait whole while any visit has a machine nobody has matched", () => {
    const plan = planClient(
      input([
        line("2026-01-05", "Comp. Row", 1, 20, 8),
        line("2026-01-08", "Mystery Machine", 1, 20, 8),
        line("2026-01-12", "Comp. Row", 1, 22, 8),
        line("2026-10-12", "Mystery Machine", 1, 30, 8),
      ]),
    );
    expect(plan.sessions).toEqual([]);
    expect(plan.unmatched).toEqual(["Mystery Machine"]);
    expect(plan.skipped).toEqual([
      { day: "2026-01-05", why: "waits with the client: other visits wait for the machine table" },
      { day: "2026-01-08", why: "waiting for the machine table: Mystery Machine" },
      { day: "2026-01-12", why: "waits with the client: other visits wait for the machine table" },
      // After the last day: not a reason to wait.
      { day: "2026-10-12", why: "after 2026-10-11, the last day to import" },
    ]);
  });

  it("leaves out a visit where nothing was done, without giving it a number", () => {
    const plan = planClient(
      input([
        line("2025-12-22", "Pullover", 1, 80, null, 0),
        line("2025-12-22", "Comp. Row", 2, 30, 0),
        line("2025-12-26", "Lumbar", 1, 44, 25),
        line("2025-12-29", "Abs", 1, 40, 8),
        line("2026-01-02", "Comp. Row", 1, 30, 9),
      ]),
    );
    expect(plan.sessions.map((s) => [s.day, s.number])).toEqual([["2026-01-02", 1]]);
    expect(plan.skipped).toEqual([
      { day: "2025-12-22", why: "nothing was done that day (every machine 0, blank or unreadable)" },
      { day: "2025-12-26", why: "nothing was done that day (every machine 0, blank or unreadable)" },
      // Done, but only on a machine the table skips: left out, and not numbered either.
      { day: "2025-12-29", why: "nothing importable was done that day (skipped or held entries only)" },
    ]);
  });

  it("imports nothing without a last day", () => {
    const plan = planClient(input(lines, { through: null }));
    expect(plan.sessions).toEqual([]);
    expect(plan.skipped[0].why).toBe("no last day to import was given");
  });

  it("marks what an earlier run wrote, so nothing is written twice, and notices when its number has moved", () => {
    const id = sessionIdFor("100000001", "2026-03-19");
    const same = planClient(input(lines, { existing: new Map([[id, 1]]) }));
    expect(same.sessions.map((s) => s.exists)).toEqual([true, false]);
    expect(same.numberDrift).toEqual([]);
    const moved = planClient(input(lines, { existing: new Map([[id, 7]]) }));
    expect(moved.numberDrift).toEqual([{ id, stored: 7, planned: 1 }]);
  });

  it("numbers from a stated total before Journey, the same on every run", () => {
    const prior = { sessions: 300, importedCount: 0, through: "2026-10-11", source: "mindbody" as const };
    expect(numberOffsetFor(prior, 214, 0)).toBe(86);
    expect(numberOffsetFor({ ...prior, importedCount: 214 }, 214, 214)).toBe(86);
    expect(numberOffsetFor(null, 214, 0)).toBe(0);
    expect(numberOffsetFor({ ...prior, sessions: 100 }, 214, 0)).toBe(0);
  });

  it("knows each machine's first FileMaker day with a weight done", () => {
    const plan = planClient(
      input([
        line("2025-01-06", "Comp. Row", 1, 20, 8),
        line("2025-01-20", "Comp. Row", 1, 24, 9),
        line("2025-01-20", "Pullover", 2, 0, null),
        line("2025-01-27", "Pullover", 1, 50, 9),
      ]),
    );
    expect(plan.firstDays).toEqual({ "m-compound-row": "2025-01-06", "m-pullover": "2025-01-27" });
  });

  it("puts the trainer's initials on a visit when the export carries them, and only one", () => {
    const one = planClient(input([line("2026-02-01", "Comp. Row", 1, 20, 8, null, "aj"), line("2026-02-01", "Pullover", 2, 50, 9, null, "AJ")]));
    expect(one.sessions[0].data.trainerInitials).toBe("AJ");
    const two = planClient(input([line("2026-02-01", "Comp. Row", 1, 20, 8, null, "AJ"), line("2026-02-01", "Pullover", 2, 50, 9, null, "MP")]));
    expect(two.sessions[0].data.trainerInitials).toBe("");
  });
});

describe("the client's own documents, written with the sessions", () => {
  const lines = [
    line("2026-03-19", "Leg Press Imag.", 1, 80, 12, 86),
    line("2026-03-19", "Comp. Row", 2, 26, null),
    line("2026-03-26", "Leg Press Imag.", 1, 86, 10),
    line("2026-03-26", "Pullover", 2, 88, 90),
  ];
  const now = (over: Partial<ClientNow> = {}): ClientNow => ({
    priorHistory: null,
    lastSessionDate: null,
    legacyFilemakerId: null,
    completedSessions: 0,
    trainerTally: null,
    topTrainerId: null,
    machineStats: null,
    lastMetricDay: () => null,
    ...over,
  });
  const write = (plan = planClient(input(lines)), n = now(), wholeStory = false) =>
    clientWriteFor(plan.sessions.filter((s) => !s.exists), plan.firstDays, n, plainFieldOps, { fmClientId: "FM-1", wholeStory });

  it("counts the sessions it created, and the reps and volume as Finish would, a count not written counting nothing", () => {
    const w = write();
    expect(w.created).toBe(2);
    expect(w.client).toMatchObject({
      completedSessions: 2,
      sessionCount: 2,
      lastSessionDate: "2026-03-26",
      legacy_filemaker_id: "FM-1",
      // 12 + 10 reps + 90 seconds of hold (90 / 30 × 2 = 6).
      lifetimeReps: 28,
      // 80 × 12 + 86 × 10; the hold and the unwritten count add no volume.
      lifetimeWeight: 1820,
    });
  });

  it("sets the session count as the profile works it out, so a stated total stays the total", () => {
    const prior = { sessions: 300, importedCount: 0, through: "2026-10-11", source: "mindbody" as const };
    const w = write(undefined, now({ priorHistory: prior, completedSessions: 0 }));
    expect(w.client.priorHistory).toEqual({ ...prior, importedCount: 2 });
    // 2 imported + the 298 the stated total still holds uncounted = 300, as before the import.
    expect(w.client.sessionCount).toBe(300);
    // No stated total: Journey's sessions, these included.
    expect(write(undefined, now({ completedSessions: 5 })).client.sessionCount).toBe(7);
  });

  it("never moves the last session back", () => {
    expect(write(undefined, now({ lastSessionDate: "2026-10-10T09:00:00" })).client).not.toHaveProperty("lastSessionDate");
  });

  it("puts the machine counts in the totals document and 'last time' only where nothing newer is on file", () => {
    const w = write(undefined, now({ lastMetricDay: (m) => (m === "m-pullover" ? "2026-09-01" : null) }));
    expect(w.totals["machineStats.m-leg-press.timesPerformed"]).toBe(2);
    expect(w.totals["machineStats.m-leg-press.firstPerformedDate"]).toBe("2026-03-19");
    expect(w.totals["machineStats.m-compound-row.timesPerformed"]).toBe(1);
    expect(w.totals["currentMachineMetrics.m-leg-press"]).toMatchObject({ weight: "86", reps: "10", lastSessionId: "fm_100000001_2026-03-26", lastPerformedSessionNumber: 2 });
    expect(w.totals).not.toHaveProperty("currentMachineMetrics.m-pullover");
    expect(Object.keys(w.client).some((k) => k.startsWith("machineStats"))).toBe(false);
    // The profile's one-time rebuild of every session's sets has nothing to do: its marker says so.
    expect(w.totals).toHaveProperty("machineStatsBackfilledAt");
  });

  it("keeps 'last time' on the newest set with a weight", () => {
    const plan = planClient(input([line("2026-03-01", "Comp. Row", 1, 30, 9), line("2026-03-08", "Comp. Row", 1, null, 10)]));
    expect(write(plan).totals["currentMachineMetrics.m-compound-row"]).toMatchObject({ weight: "30", lastSessionId: "fm_100000001_2026-03-01" });
  });

  it("sets next time's weight from FileMaker's when one was set, else the last weight done; a starting weight only from the machine's first FileMaker day, when FileMaker holds the whole story", () => {
    const plan = planClient(input([...lines, line("2026-04-02", "Comp. Row", 1, 28, 9, 30)]));
    expect(write(plan).settings.find((s) => s.machineId === "m-compound-row")).toEqual({ machineId: "m-compound-row", day: "2026-04-02", currentWeight: 30, startingWeight: null, startingDay: null });
    expect(write(plan).settings.find((s) => s.machineId === "m-leg-press")).toMatchObject({ currentWeight: 86 });
    expect(write(plan, now(), true).settings.find((s) => s.machineId === "m-leg-press")).toMatchObject({ startingWeight: 80, startingDay: "2026-03-19" });
    // A batch that doesn't hold the machine's first day sets no starting weight.
    const later = plan.sessions.filter((s) => s.day >= "2026-03-26");
    expect(clientWriteFor(later, plan.firstDays, now(), plainFieldOps, { fmClientId: "FM-1", wholeStory: true }).settings.find((s) => s.machineId === "m-leg-press")).toMatchObject({ startingWeight: null });
  });

  it("adds the imported trainers to the tally on file, not over it", () => {
    const plan = planClient(input([line("2026-02-01", "Comp. Row", 1, 20, 8, null, "MP")]));
    const w = write(plan, now({ trainerTally: { "trainer-a": 40 }, topTrainerId: "trainer-a" }));
    expect(w.client["trainerTally.initials:MP"]).toBe(1);
    expect(w.client.topTrainerId).toBe("trainer-a");
  });

  it("writes nothing when nothing is created", () => {
    expect(clientWriteFor([], {}, now(), plainFieldOps, { fmClientId: "FM-1", wholeStory: false })).toEqual({ client: {}, totals: {}, settings: [], created: 0 });
  });
});
