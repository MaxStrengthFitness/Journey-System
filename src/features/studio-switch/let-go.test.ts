import { describe, expect, it } from "vitest";
import { CLIENT_SCREENS, afterStudioMove } from "./let-go";

describe("a studio switch lets go of the client (Oct 12 2026)", () => {
  it("is no switch on the same studio, or entering one from none", () => {
    expect(afterStudioMove("westlake", "westlake", "profile")).toBeNull();
    expect(afterStudioMove(null, "westlake", "profile")).toBeNull();
    expect(afterStudioMove(null, null, "clients")).toBeNull();
  });

  it("lets go on a move to another studio, and on leaving one for none", () => {
    expect(afterStudioMove("westlake", "solon", "clients")).toEqual({ toHub: false });
    expect(afterStudioMove("westlake", null, "clients")).toEqual({ toHub: false });
  });

  it("sends a client's own screen to the Hub, and leaves every other screen where it is", () => {
    for (const view of ["profile", "progress-report", "workouts"] as const) {
      expect(afterStudioMove("westlake", "solon", view)).toEqual({ toHub: true });
    }
    for (const view of ["clients", "client-directory", "admin-dashboard", "admins-dashboard", "studio-tasks", "calendar", "learning"] as const) {
      expect(afterStudioMove("westlake", "solon", view)).toEqual({ toHub: false });
    }
    expect([...CLIENT_SCREENS].sort()).toEqual(["profile", "progress-report", "workouts"]);
  });
});
