import { describe, expect, it } from "vitest";
import { checkMerge, chunks, keptPatch, referencesFor, tombstonePatch } from "./merge";

const UID = "6bCBnGXtYFYm0w7WL3UDXL2OcKE2";
const OLD = "Taz36HFLtuHGMbfi35I2";
const oldKyle = { fullName: "Kyle McManus", mindbodyStaffId: "100000071", initials: "KM", order: 4, primaryHomeStudioId: "strongsville" };
const newKyle = { fullName: "Kyle McManus", email: "kyle@maxstrengthfitness.com", authUid: UID, role: "LifeTransformer", primaryHomeStudioId: "strongsville" };

describe("merging Kyle's two records (Oct 20 2026)", () => {
  it("keeps only the signed-in record, and refuses two different Mindbody people", () => {
    expect(checkMerge(OLD, oldKyle, UID, newKyle, "merge")).toEqual({ ok: true });
    expect(checkMerge(UID, newKyle, OLD, oldKyle, "merge").ok).toBe(false);
    expect(checkMerge(OLD, oldKyle, UID, { ...newKyle, mindbodyStaffId: "100000059" }, "merge").reason).toContain("different Mindbody staff ids");
    expect(checkMerge(OLD, { ...oldKyle, supersededByUid: UID }, UID, newKyle, "merge").reason).toContain("already merged");
    expect(checkMerge(OLD, oldKyle, UID, { ...newKyle, isActive: false }, "merge").ok).toBe(false);
    expect(checkMerge(OLD, null, UID, newKyle, "merge").ok).toBe(false);
  });

  it("gives the kept record the Mindbody link and what it lacks, never overwriting what it has", () => {
    expect(keptPatch(oldKyle, newKyle, OLD, "merge")).toEqual({
      mindbodyStaffId: "100000071",
      mindbodyLinked: true,
      initials: "KM",
      order: 4,
      claimedFromId: OLD,
      mergedFromIds: [OLD],
    });
    expect(keptPatch(oldKyle, { ...newKyle, initials: "KY", claimedFromId: "x" }, OLD, "merge")).not.toHaveProperty("initials");
  });

  it("joins the Kaizen rosters without doubling a client", () => {
    const patch = keptPatch(
      { ...oldKyle, kaizenRoster: [{ clientId: "c1" }, { clientId: "c2" }] },
      { ...newKyle, kaizenRoster: [{ clientId: "c2", note: "mine" }] },
      OLD,
      "merge",
    );
    expect(patch.kaizenRoster).toEqual([{ clientId: "c2", note: "mine" }, { clientId: "c1" }]);
  });

  it("leaves the old record as a pointer holding no staff id", () => {
    expect(tombstonePatch(oldKyle, UID, "2026-10-20T17:00:00.000Z")).toEqual({
      supersededByUid: UID,
      supersededAt: "2026-10-20T17:00:00.000Z",
      systemStatus: "superseded",
      isVisibleOnCalendar: false,
      mindbodyStaffId: "",
      mindbodyLinked: false,
      mergedMindbodyStaffId: "100000071",
    });
  });

  it("moves bookings first, and bookings-only moves bookings and sessions and nothing on either record", () => {
    expect(referencesFor("merge")[0]).toEqual({ collection: "schedules", field: "trainerId" });
    expect(referencesFor("bookings-only").map((r) => `${r.collection}.${r.field}`)).toEqual([
      "schedules.trainerId",
      "sessions.trainerId",
      "sessions.startedByTrainerId",
    ]);
    expect(referencesFor("merge").some((r) => r.field === "rollupTrainerId")).toBe(false);
    expect(keptPatch({ fullName: "Austin", mindbodyStaffId: "" }, { fullName: "Austin" }, "2GIp", "bookings-only")).toEqual({ claimedFromId: "2GIp" });
  });

  it("writes in batches under Firestore's limit", () => {
    expect(chunks(Array.from({ length: 1001 }, (_, i) => i)).map((c) => c.length)).toEqual([400, 400, 201]);
  });
});
