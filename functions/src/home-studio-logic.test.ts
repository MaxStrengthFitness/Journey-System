import { describe, expect, it } from "vitest";
import { homeOf, mayMoveClientsTo, noEvidenceBecause, tallyBookings, type EvidenceInput } from "./home-studio-logic";

const STRONG = "BVDDRe5AqQZFihRLW0vK";
const WEST = "A4uvDltWoJuCas0hqEkG";

describe("mayMoveClientsTo", () => {
  it("lets the company tier move a client to any real studio", () => {
    for (const role of ["Admin", "Founder", "Overseer"]) expect(mayMoveClientsTo({ role }, STRONG)).toBe(true);
  });

  it("lets a head trainer, studio leader, studio owner and franchise owner move one to their own studio", () => {
    for (const role of ["HeadTrainer", "StudioLeader", "StudioOwner", "FranchiseOwner", "Owner"]) {
      expect(mayMoveClientsTo({ role, primaryHomeStudioId: STRONG }, STRONG)).toBe(true);
    }
  });

  it("does not let a leader move one to a studio that is not theirs", () => {
    expect(mayMoveClientsTo({ role: "HeadTrainer", primaryHomeStudioId: WEST }, STRONG)).toBe(false);
  });

  it("counts a franchise owner's owned studios and a trainer's grant", () => {
    expect(mayMoveClientsTo({ role: "FranchiseOwner", primaryHomeStudioId: WEST, ownedStudioIds: [STRONG] }, STRONG)).toBe(true);
    expect(mayMoveClientsTo({ role: "LifeTransformer", primaryHomeStudioId: WEST, managedStudioIds: [STRONG] }, STRONG)).toBe(true);
  });

  it("does not let a trainer move anyone, nor a trainer's owned list count without a running role", () => {
    expect(mayMoveClientsTo({ role: "LifeTransformer", primaryHomeStudioId: STRONG }, STRONG)).toBe(false);
    expect(mayMoveClientsTo({ role: "Trainer", primaryHomeStudioId: STRONG, ownedStudioIds: [STRONG] }, STRONG)).toBe(false);
  });

  it("never moves a client into Demo Mode, even for an administrator, and refuses a missing person", () => {
    expect(mayMoveClientsTo({ role: "Admin" }, "demo-studio")).toBe(false);
    expect(mayMoveClientsTo(null, STRONG)).toBe(false);
    expect(mayMoveClientsTo({ role: "Admin" }, "")).toBe(false);
  });
});

const meg: EvidenceInput = { studioId: STRONG, studioSite: "29068", home: WEST, clientSite: "29068", here: 4, atHome: 0 };

describe("noEvidenceBecause", () => {
  it("is null for Meg: four bookings here, none at the studio she is filed at", () => {
    expect(noEvidenceBecause(meg)).toBeNull();
  });

  it("is null for a client filed nowhere yet who trains here", () => {
    expect(noEvidenceBecause({ ...meg, home: null })).toBeNull();
  });

  it("says nothing is wrong for a client already filed here", () => {
    expect(noEvidenceBecause({ ...meg, home: STRONG })).toMatch(/already filed/);
  });

  it("leaves a client alone who also trains at the studio she is filed at", () => {
    expect(noEvidenceBecause({ ...meg, atHome: 1 })).toMatch(/also trains/);
  });

  it("needs a booking here", () => {
    expect(noEvidenceBecause({ ...meg, here: 0 })).toMatch(/No live booking/);
  });

  it("will not cross Mindbody sites, nor guess when either site is unknown", () => {
    expect(noEvidenceBecause({ ...meg, clientSite: "5746957" })).toMatch(/can't tell/);
    expect(noEvidenceBecause({ ...meg, clientSite: "" })).toMatch(/can't tell/);
    expect(noEvidenceBecause({ ...meg, studioSite: "" })).toMatch(/can't tell/);
  });

  it("leaves a visitor already approved to train here alone", () => {
    expect(noEvidenceBecause({ ...meg, approvedHere: true })).toMatch(/approved/);
  });

  it("never moves a practice-studio record", () => {
    expect(noEvidenceBecause({ ...meg, home: "demo-studio" })).toMatch(/practice/);
  });
});

describe("homeOf", () => {
  it("prefers homeStudioId, falls back to studioId, else none", () => {
    expect(homeOf({ homeStudioId: WEST, studioId: STRONG })).toBe(WEST);
    expect(homeOf({ studioId: STRONG })).toBe(STRONG);
    expect(homeOf({ homeStudioId: "" })).toBeNull();
    expect(homeOf({})).toBeNull();
  });
});

describe("tallyBookings", () => {
  it("counts live bookings per client and keeps the latest start", () => {
    const t = tallyBookings([
      { clientId: "a", status: "Scheduled", startMs: 100 },
      { clientId: "a", status: "Scheduled", startMs: 300 },
      { clientId: "a", status: "Cancelled", startMs: 900 },
      { clientId: "b", status: "Scheduled", startMs: 50 },
      { clientId: "", status: "Scheduled", startMs: 1 },
      { status: "Scheduled", startMs: 1 },
    ]);
    expect(t.get("a")).toEqual({ count: 2, lastMs: 300 });
    expect(t.get("b")).toEqual({ count: 1, lastMs: 50 });
    expect(t.size).toBe(2);
  });
});
