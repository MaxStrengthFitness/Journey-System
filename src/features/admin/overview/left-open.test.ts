import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "../../../types";
import { leftOpenHeading, leftOpenSessions, needsYouCount } from "./left-open";

const NOW = Date.parse("2026-10-02T15:00:00-04:00");
const s = (id: string, over: Partial<WorkoutSession> = {}): WorkoutSession =>
  ({ id, clientId: `c-${id}`, clientName: `Client ${id}`, hostedAtStudioId: "westlake", status: "In-Progress", trainerInitials: "SG", ...over }) as WorkoutSession;
const names = (id: string) => (id === "t-sam" ? "Sam Gamgee" : id === "t-ann" ? "Ann Able" : null);

describe("sessions not finished (the Atlas answers, Oct 2 2026; the sessions round, Oct 12 2026)", () => {
  it("lists In-Progress sessions an hour past their last sign of life, the Hub's own rule", () => {
    const rows = leftOpenSessions(
      [
        s("stale", { lastHeartbeatAt: Date.parse("2026-10-02T09:40:00-04:00"), sessionMachineIds: ["a", "b", "c"], startedByTrainerId: "t-sam" }),
        s("live", { lastHeartbeatAt: NOW - 10 * 60_000 }),
        s("done", { status: "Completed", createdAt: Date.parse("2026-09-30T09:00:00-04:00") }),
        s("old", { createdAt: Date.parse("2026-09-29T08:00:00-04:00") }),
      ],
      NOW,
      { trainerNameOf: names, tz: "America/New_York" },
    );
    expect(rows.map((r) => r.id)).toEqual(["stale", "old"]);
    expect(rows[0]).toMatchObject({ kind: "client", clientId: "c-stale", clientName: "Client stale", trainer: "Sam Gamgee", machines: 3, quiet: "left-open" });
    expect(rows[0].detail).toBe("Last active 9:40 AM · 3 machines logged · started by Sam");
    expect(rows[1].detail).toBe("Last active Tue 8:00 AM · started by SG");
  });

  it("names an open session by whose it is, never 'A client', and doesn't name the trainer twice", () => {
    const rows = leftOpenSessions(
      [
        s("open", { clientId: undefined, clientName: undefined, isUnassigned: true, trainerId: "t-ann", startedByTrainerId: "t-sam", lastHeartbeatAt: Date.parse("2026-10-02T10:00:00-04:00"), sessionMachineIds: ["a"] }),
        s("nobody", { clientId: undefined, clientName: undefined, isUnassigned: true, trainerInitials: "", createdAt: Date.parse("2026-10-02T08:00:00-04:00") }),
      ],
      NOW,
      { trainerNameOf: names, tz: "America/New_York" },
    );
    expect(rows[0]).toMatchObject({ kind: "open", clientId: null, clientName: "Open session · Ann" });
    expect(rows[0].detail).toBe("Last active 10:00 AM · 1 machine logged");
    expect(rows[1].clientName).toBe("Open session");
    expect(rows.map((r) => r.clientName).join()).not.toContain("A client");
  });

  it("says Paused and At End Session on the day, and counts only Left open in Needs you", () => {
    const rows = leftOpenSessions(
      [
        s("paused", { lastHeartbeatAt: Date.parse("2026-10-02T13:00:00-04:00"), pausedAt: Date.parse("2026-10-02T13:10:00-04:00") }),
        s("ended", { lastHeartbeatAt: Date.parse("2026-10-02T12:00:00-04:00"), endTime: Date.parse("2026-10-02T12:05:00-04:00") }),
        s("left", { lastHeartbeatAt: Date.parse("2026-10-01T12:00:00-04:00"), pausedAt: Date.parse("2026-10-01T12:05:00-04:00") }),
      ],
      NOW,
      { tz: "America/New_York" },
    );
    expect(rows.map((r) => [r.id, r.quiet])).toEqual([
      ["paused", "paused"],
      ["ended", "at-end-session"],
      ["left", "left-open"],
    ]);
    expect(rows[0].detail).toBe("Since 1:10 PM · started by SG");
    expect(rows[1].detail).toBe("Since 12:05 PM · started by SG");
    expect(needsYouCount(rows)).toBe(1);
  });

  it("says how many in a heading", () => {
    expect(leftOpenHeading(1)).toBe("Not finished (1)");
    expect(leftOpenHeading(3)).toBe("Not finished (3)");
  });
});
