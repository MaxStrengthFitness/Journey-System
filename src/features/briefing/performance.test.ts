import { describe, expect, it } from "vitest";
import type { ExerciseLog, WorkoutSession } from "../../types";
import { PERFORMANCE_SESSIONS, cellOf, otherMachinesDone, performanceGrid } from "./performance";

const set = (over: Partial<ExerciseLog> & { sessionId: string; machineId: string }): ExerciseLog =>
  ({ outcome: "performed", weight: "100", reps: "8", createdAt: new Date("2026-10-01T15:00:00Z"), ...over }) as ExerciseLog;
const session = (id: string, date: string): WorkoutSession =>
  ({ id, status: "Completed", date, startTime: new Date(`${date}T14:00:00Z`) }) as unknown as WorkoutSession;

describe("how have they been doing (the briefing's question 3)", () => {
  const sessions = [session("s1", "2026-10-01"), session("s2", "2026-10-05"), session("s3", "2026-10-09")];
  const logs = [
    set({ sessionId: "s1", machineId: "lp", weight: "130", reps: "10", createdAt: new Date("2026-10-01T14:05:00Z") }),
    set({ sessionId: "s2", machineId: "lp", weight: "136", reps: "9", createdAt: new Date("2026-10-05T14:05:00Z") }),
    set({ sessionId: "s3", machineId: "lp", weight: "142", reps: "9", createdAt: new Date("2026-10-09T14:05:00Z") }),
    set({ sessionId: "s3", machineId: "cr", weight: "70", reps: "9", createdAt: new Date("2026-10-09T14:10:00Z") }),
    // Another machine, in a session of its own: not today's.
    set({ sessionId: "s4", machineId: "neck", weight: "40", reps: "8", createdAt: new Date("2026-10-07T14:10:00Z") }),
  ];

  it("one column per session, newest first, one row per machine of today's", () => {
    const g = performanceGrid({ machineIds: ["lp", "cr"], logs, sessions });
    expect(g.columns.map((c) => c.day)).toEqual(["2026-10-09", "2026-10-05", "2026-10-01"]);
    expect(g.rows.map((r) => r.machineId)).toEqual(["lp", "cr"]);
    expect(g.rows[0].cells.map((c) => c?.weight)).toEqual(["142", "136", "130"]);
    // Not done that session: an empty cell, never a guessed one.
    expect(g.rows[1].cells).toEqual([{ weight: "70", reps: "9", unit: "reps" }, null, null]);
  });

  it("is only the sessions one of today's machines was done in, and at most the handoff's five to ten", () => {
    expect(performanceGrid({ machineIds: ["lp"], logs, sessions }).columns.some((c) => c.sessionId === "s4")).toBe(false);
    const many = Array.from({ length: 12 }, (_, i) =>
      set({ sessionId: `m${i}`, machineId: "lp", createdAt: new Date(Date.UTC(2026, 8, i + 1, 14)) }),
    );
    const g = performanceGrid({ machineIds: ["lp"], logs: many });
    expect(g.columns).toHaveLength(PERFORMANCE_SESSIONS);
    expect(g.columns[0].sessionId).toBe("m11");
  });

  it("shows only performed sets, the newest of a session", () => {
    const g = performanceGrid({
      machineIds: ["lp"],
      logs: [
        set({ sessionId: "s1", machineId: "lp", weight: "60", outcome: "practice" } as never),
        set({ sessionId: "s1", machineId: "lp", weight: "120", createdAt: new Date("2026-10-01T14:01:00Z") }),
        set({ sessionId: "s1", machineId: "lp", weight: "125", createdAt: new Date("2026-10-01T14:02:00Z") }),
      ],
      sessions,
    });
    expect(g.rows[0].cells.map((c) => c?.weight)).toEqual(["125"]);
  });

  it("reads a timed set's seconds", () => {
    expect(cellOf(set({ sessionId: "s1", machineId: "po", isTSC: true, seconds: "90", reps: "" }))).toEqual({ weight: "100", reps: "90", unit: "sec" });
  });

  it("says nothing when nothing is recorded in Journey", () => {
    const g = performanceGrid({ machineIds: ["lp"], logs: [], sessions });
    expect(g.columns).toEqual([]);
    expect(g.rows[0].cells).toEqual([]);
  });

  it("names the other machines done, the most recent first", () => {
    expect(otherMachinesDone(logs, ["lp"])).toEqual(["cr", "neck"]);
  });
});
