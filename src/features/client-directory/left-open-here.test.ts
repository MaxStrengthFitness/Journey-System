import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "../../types";
import { openSessionsLeftHere } from "./left-open-here";

const TZ = "America/New_York";
const NOW = Date.parse("2026-10-12T15:00:00-04:00");
const at = (iso: string) => Date.parse(iso);
const s = (id: string, over: Partial<WorkoutSession>): WorkoutSession =>
  ({ id, status: "In-Progress", hostedAtStudioId: "westlake", isUnassigned: true, trainerId: "t-sam", trainerInitials: "SR", ...over }) as WorkoutSession;

describe("open sessions left open here (the sessions round, Oct 12 2026)", () => {
  it("keeps only open sessions the staleness rule calls left open, named by their trainer, with why they went quiet", () => {
    const rows = openSessionsLeftHere(
      [
        s("left", { lastHeartbeatAt: at("2026-10-12T09:40:00-04:00") }),
        s("live", { lastHeartbeatAt: at("2026-10-12T14:50:00-04:00") }),
        s("paused", { lastHeartbeatAt: at("2026-10-12T13:00:00-04:00"), pausedAt: at("2026-10-12T13:10:00-04:00"), trainerId: "t-x" }),
        s("given", { clientId: "c1", lastHeartbeatAt: at("2026-10-12T09:00:00-04:00") }),
        s("done", { status: "Completed", lastHeartbeatAt: at("2026-10-12T09:00:00-04:00") }),
      ],
      NOW,
      { trainerNameOf: (id) => (id === "t-sam" ? "Sam Rivera" : null), tz: TZ },
    );
    expect(rows).toEqual([
      { id: "left", line: "Open session · Sam · Left open · last active 9:40 AM" },
      { id: "paused", line: "Open session · SR · Paused at 1:10 PM" },
    ]);
  });
});
