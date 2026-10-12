/**
 * REPS NOT RECORDED, everywhere it is read (the history-ready round, Oct 12
 * 2026; AJ: a weight with no reps was done, "no trainer puts it in"; "1a 2a").
 *
 * A performed set with no count counts for its WEIGHT and never for anything
 * about reps. One file, so the whole rule is read in one place: the helper,
 * then each reader that used to treat the missing count as 0 or 1.
 */
import { describe, expect, it } from "vitest";
import type { ExerciseLog, WorkoutSession } from "../types";
import { isRepsNotRecorded, repsOf } from "./set-outcome";
import { calculateExerciseVolume } from "./utils";
import { todayLines } from "./post-session";
import { attendanceStatsFrom, machineStatsFrom } from "./progress-utils";
import { toJourneySet } from "../features/journey-grid/adapters";
import { trendVsPrevious } from "../features/journey-grid/stats";
import { summarizeSession, volumeDeltas } from "../features/client-history/model";
import { detectPlateaus, withBaselines } from "../features/clinical-review/analytics";
import { plateauInsights, stallSentence } from "../features/clinical-review/insights";
import type { SessionFact, SetFact } from "../features/clinical-review/types";

/** A set as a log carries it: weight and all (OutcomeLog names only what the rule reads). */
const log = (o: Record<string, unknown>) => o as never;
const notRecorded = { outcome: "performed" as const, weight: "70", repsNotRecorded: true };
const counted = { outcome: "performed" as const, weight: "70", reps: "9" };

describe("the rule (lib/set-outcome.ts)", () => {
  it("knows a performed set with no count, from the counts, whatever the flag says", () => {
    expect(isRepsNotRecorded(notRecorded)).toBe(true);
    expect(isRepsNotRecorded(log({ outcome: "performed", weight: "70" }))).toBe(true);
    // A count typed in later makes it an ordinary set, the flag or not.
    expect(isRepsNotRecorded({ ...notRecorded, reps: "8" })).toBe(false);
    expect(isRepsNotRecorded(counted)).toBe(false);
    expect(isRepsNotRecorded(log({ outcome: "performed", weight: "88", seconds: "90", isTSC: true }))).toBe(false);
    // Not performed is not "done, reps not recorded".
    expect(isRepsNotRecorded(log({ outcome: "skipped", weight: "70" }))).toBe(false);
    // A weight alone with no outcome is the legacy skip (Sep 12 2026), unchanged.
    expect(isRepsNotRecorded(log({ weight: "70" }))).toBe(false);
  });

  it("gives the reps as a number, or null for a hold or a missing count", () => {
    expect(repsOf(counted)).toBe(9);
    expect(repsOf({ outcomeReps: 7 })).toBe(7);
    expect(repsOf(notRecorded)).toBe(null);
    expect(repsOf({ reps: "0" })).toBe(null);
    expect(repsOf({ reps: "9", isTSC: true })).toBe(null);
  });
});

describe("the Journey grid", () => {
  it("draws the weight and carries the mark; a reps arrow never comes off a missing count", () => {
    const set = toJourneySet({ sessionId: "s2", machineId: "m", ...notRecorded } as never)!;
    expect(set).toMatchObject({ weight: 70, outcome: "performed", repsNotRecorded: true });
    const before = toJourneySet({ sessionId: "s1", machineId: "m", ...counted } as never)!;
    expect(trendVsPrevious(set, before)).toBe(null);
    expect(trendVsPrevious(before, set)).toBe(null);
    // The load still speaks.
    expect(trendVsPrevious({ ...set, weight: 72 }, before)).toBe("up");
  });
});

describe("the Wrap-up", () => {
  it("never says '+10 reps' against a last time whose count was never written down", () => {
    const [line] = todayLines({
      order: ["m"],
      logs: [{ machineId: "m", weight: "70", reps: "10", outcome: "performed" }],
      nameOf: () => "Leg Press",
      priorOf: () => ({ weight: 70, reps: null }),
    });
    expect(line.countDelta).toBe(null);
    expect(line.loadDelta).toBe(0);
  });
});

describe("volume", () => {
  it("moves nothing for a set with no count (it used to count weight × 1)", () => {
    expect(calculateExerciseVolume({ weight: "70" })).toBe(0);
    expect(calculateExerciseVolume({ weight: "70", reps: "9" })).toBe(630);
  });
});

describe("History", () => {
  const session = (id: string, date: string) => ({ id, date, status: "Completed", routineId: "a" }) as WorkoutSession;
  const log = (sessionId: string, machineId: string, over: Record<string, unknown>) => ({ sessionId, machineId, ...over }) as ExerciseLog;

  it("says a session's volume is partial, and gives no change against one", () => {
    const partial = [log("s2", "m1", counted), log("s2", "m2", notRecorded)];
    const whole = [log("s1", "m1", counted), log("s1", "m2", { ...counted, reps: "10" })];
    expect(summarizeSession(partial)).toMatchObject({ volume: 630, volumeComplete: false });
    expect(summarizeSession(whole)).toMatchObject({ volumeComplete: true });
    const deltas = volumeDeltas([session("s2", "2026-03-08"), session("s1", "2026-03-01")], new Map([["s2", partial], ["s1", whole]]));
    expect(deltas.has("s2")).toBe(false);
  });
});

describe("the progress report (AJ: '2a', the tiles say 'recorded')", () => {
  const session = (id: string, date: string) => ({ id, date, status: "Completed" }) as WorkoutSession;
  const history = {
    sessions: [session("s1", "2026-03-01"), session("s2", "2026-03-08")],
    logs: [
      { sessionId: "s1", machineId: "m", weight: "100", reps: "8", outcome: "performed" },
      { sessionId: "s2", machineId: "m", weight: "100", outcome: "performed", repsNotRecorded: true },
    ] as ExerciseLog[],
  };

  it("counts only the recorded sets in Total Reps and Total Volume, and says how many weren't", () => {
    const stats = attendanceStatsFrom(history);
    expect(stats).toMatchObject({ totalReps: 8, totalVolume: 800, unrecordedSets: 1 });
  });

  it("moves no volume for a machine's set with no count", () => {
    expect(machineStatsFrom(history).m.totalVolume).toBe(800);
  });
});

describe("the Deep Dive", () => {
  const fact = (id: string, day: number, reps: number, repsComplete: boolean): SessionFact =>
    ({ id, date: `2026-03-${String(day).padStart(2, "0")}`, dayMs: day, reps, tonnage: reps * 100, tutSeconds: 0, repsComplete }) as unknown as SessionFact;

  it("gives a session with uncounted sets no reps or tonnage index, and keeps it out of the baseline", () => {
    const facts = [fact("a", 1, 40, true), fact("b", 2, 40, true), fact("c", 3, 40, true), fact("d", 4, 12, false), fact("e", 5, 40, true)];
    const out = withBaselines(facts);
    expect(out[3]).toMatchObject({ repsIndex: null, tonnageIndex: null });
    // The baseline the next session is measured against never took the partial one in.
    expect(out[4].repsIndex).toBe(0);
  });

  it("says reps were not recorded, never 'no gain', when the load held and the counts are missing", () => {
    const set = (sessionId: string, day: number, reps: number | null): SetFact => ({
      sessionId,
      date: `2026-03-${String(day).padStart(2, "0")}`,
      dayMs: day,
      machineId: "m",
      weight: 70,
      reps,
      seconds: null,
      isTSC: false,
      quality: null,
      tutSeconds: null,
    });
    const sets = [1, 2, 3, 4, 5, 6].map((d) => set(`s${d}`, d, d === 6 ? 9 : null));
    const [p] = detectPlateaus(sets, { machineName: () => "Leg Press", machineGroup: () => "Legs" });
    expect(p).toMatchObject({ stalled: true, repsUnrecorded: true, repsAtCurrentFirst: null });
    expect(stallSentence(p)).toContain("reps not recorded");
    expect(stallSentence(p)).not.toContain("no gain");
    expect(plateauInsights([p])[0].body).toContain("reps not recorded");
  });
});
