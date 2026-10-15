/**
 * What privacy Round 0's session pin (firestore.rules sessionTenancyKept)
 * relies on in the app's own writes (docs/rounds/2026-10-14-strangers-out.md
 * §4). The pin lets a session with no host be given its client's home and
 * nothing else; these hold that no app write gives it anything else.
 */
import { describe, expect, it } from "vitest";
import { assignSessionPatch } from "../open-session/assign";
import { openSessionPayload } from "../open-session/start";

describe("the session writes the host pin relies on", () => {
  it("Who's this? never writes a session's host: the host it is handed only decides isCrossTrain", () => {
    for (const hostedAtStudioId of ["studioA", "", null, undefined]) {
      const patch = assignSessionPatch({
        client: { id: "visitor", homeStudioId: "studioB" },
        hostedAtStudioId,
        stamp: "STAMP",
      });
      expect(Object.keys(patch)).not.toContain("hostedAtStudioId");
      expect(patch.clientId).toBe("visitor");
    }
    // WorkoutTrackerView hands it `session.hostedAtStudioId || contextActiveStudioId`: a host-less
    // session named to a visitor approved at the iPad's studio is a cross-train visit, and still no host is written.
    expect(assignSessionPatch({ client: { id: "v", homeStudioId: "studioB" }, hostedAtStudioId: "studioA", stamp: 0 }).isCrossTrain).toBe(true);
  });

  it("an open session is always written with the studio it is opened at", () => {
    const payload = openSessionPayload({
      trainer: { id: "t1", fullName: "Trainer One", initials: "T1" },
      uid: "t1",
      studioId: "studioA",
      date: "2026-10-14",
      nowIso: "2026-10-14T14:00:00.000Z",
      stamp: "STAMP",
    });
    expect(payload.hostedAtStudioId).toBe("studioA");
    expect(payload.isUnassigned).toBe(true);
    expect(Object.keys(payload)).not.toContain("clientId");
  });
});
