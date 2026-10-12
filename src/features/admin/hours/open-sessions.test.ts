import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "../../../types";
import { groupOpenSessions, notFinishedLine } from "./open-sessions";

const TZ = "America/New_York";
const NOW = Date.parse("2026-10-12T15:00:00-04:00");
const at = (iso: string) => Date.parse(iso);
const s = (id: string, over: Partial<WorkoutSession>): WorkoutSession =>
  ({ id, status: "In-Progress", hostedAtStudioId: "solon", trainerId: "t1", trainerInitials: "AJ", ...over }) as WorkoutSession;
const names = (id: string) => (id === "t1" ? "AJ Jurgens" : null);

describe("Hours' sessions not finished (the sessions round, Oct 12 2026)", () => {
  it("splits running from left open by the staleness rule, newest first, and says why each went quiet", () => {
    const { running, leftOpen } = groupOpenSessions(
      [
        s("run", { clientId: "c1", clientName: "Ann Able", createdAt: at("2026-10-12T14:40:00-04:00"), lastHeartbeatAt: at("2026-10-12T14:55:00-04:00") }),
        s("old", { clientId: "c2", clientName: "Bea Best", createdAt: at("2026-10-11T09:40:00-04:00") }),
        s("paused", { isUnassigned: true, createdAt: at("2026-10-12T12:00:00-04:00"), lastHeartbeatAt: at("2026-10-12T12:30:00-04:00"), pausedAt: at("2026-10-12T12:30:00-04:00") }),
        s("done", { status: "Completed", createdAt: at("2026-10-12T10:00:00-04:00") }),
        s("run", { clientId: "c1" }),
      ],
      NOW,
      { trainerNameOf: names, tz: TZ },
    );
    expect(running).toEqual([
      { id: "run", kind: "client", clientId: "c1", name: "Ann Able", trainer: "AJ Jurgens", started: "started 2:40 PM", quiet: null },
    ]);
    expect(leftOpen.map((r) => [r.id, r.kind, r.name, r.started, r.quiet])).toEqual([
      ["paused", "open", "Open session", "started 12:00 PM", "paused"],
      ["old", "client", "Bea Best", "started yesterday 9:40 AM", "left-open"],
    ]);
    expect(leftOpen[0].clientId).toBeNull();
  });

  it("says the month line in plain words", () => {
    expect(notFinishedLine(1)).toBe("1 session isn't finished, so its hours aren't counted yet.");
    expect(notFinishedLine(3)).toBe("3 sessions aren't finished, so their hours aren't counted yet.");
  });
});
