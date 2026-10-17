import { describe, expect, it } from "vitest";
import { closeTargetOf } from "./close-target";

describe("the briefing's close goes back where Start was tapped (AJ's F4, Oct 16 2026)", () => {
  it("names the screen it goes back to", () => {
    expect(closeTargetOf("clients")).toEqual({ view: "clients", words: "Back to the Hub" });
    expect(closeTargetOf("calendar")).toEqual({ view: "calendar", words: "Back to Calendar" });
    expect(closeTargetOf("client-directory")).toEqual({ view: "client-directory", words: "Back to Clients" });
  });

  it("a profile, an unknown screen or none goes to the profile, as the close always did", () => {
    expect(closeTargetOf("profile", "Robbin")).toEqual({ view: "profile", words: "Back to Robbin's profile" });
    expect(closeTargetOf("trainer-profile" as never, "Robbin").view).toBe("profile");
    expect(closeTargetOf(null)).toEqual({ view: "profile", words: "Back to the profile" });
  });

  it("never sends the briefing back to the session it is in front of", () => {
    expect(closeTargetOf("workouts").view).toBe("profile");
  });
});
