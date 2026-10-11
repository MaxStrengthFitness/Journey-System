import { describe, expect, it } from "vitest";
import type { Trainer } from "../../../types";
import { isOwnRow, mayHandOutRole, staffEditLimits } from "./edit-limits";

function person(over: Partial<Trainer> & { id: string }): Trainer {
  return {
    fullName: "Pat Person",
    initials: "PP",
    role: "LifeTransformer",
    primaryHomeStudioId: "a",
    accessibleStudioIds: ["a"],
    activeGuestStudioIds: [],
    ...over,
  } as Trainer;
}

const studios = [
  { id: "a", name: "Solon" },
  { id: "b", name: "Westlake" },
];

const leaderA = person({ id: "lead", fullName: "Lee Leader", role: "StudioLeader", email: "lee@x.com", authUid: "uid-lead" });
const ownerA = person({ id: "own", fullName: "Olive Owner", role: "FranchiseOwner", ownedStudioIds: ["a"], primaryHomeStudioId: "c" });
const admin = person({ id: "adm", fullName: "Ada Admin", role: "Admin", primaryHomeStudioId: "system" });

describe("mayHandOutRole (the rules' mayHandOut)", () => {
  it("an administrator anything, a franchise owner anything but an administrator, a leader the studio tier", () => {
    expect(mayHandOutRole("Admin", "Founder")).toBe(true);
    expect(mayHandOutRole("FranchiseOwner", "StudioOwner")).toBe(true);
    expect(mayHandOutRole("Owner", "Admin")).toBe(false);
    expect(mayHandOutRole("StudioLeader", "HeadTrainer")).toBe(true);
    expect(mayHandOutRole("StudioLeader", null)).toBe(true);
    expect(mayHandOutRole("StudioLeader", "StudioOwner")).toBe(false);
    expect(mayHandOutRole("StudioLeader", "Owner")).toBe(false);
    expect(mayHandOutRole("StudioLeader", "Admin")).toBe(false);
  });
});

describe("isOwnRow (the rules' ownsTrainerDoc)", () => {
  it("is the same document, the same Auth uid, or the same email (case-blind, never empty)", () => {
    expect(isOwnRow(leaderA, person({ id: "lead" }))).toBe(true);
    expect(isOwnRow(leaderA, person({ id: "other", authUid: "uid-lead" }))).toBe(true);
    expect(isOwnRow(leaderA, person({ id: "other", email: "LEE@x.com " }))).toBe(true);
    expect(isOwnRow(person({ id: "x", email: "" }), person({ id: "y", email: "" }))).toBe(false);
    expect(isOwnRow(leaderA, person({ id: "other" }))).toBe(false);
  });
});

describe("staffEditLimits", () => {
  it("locks nothing with no target (a request row)", () => {
    const l = staffEditLimits({ viewer: leaderA, target: null, viewerIsAdmin: false });
    expect(l).toEqual({ readOnly: false, roleLocked: false, homeLocked: false, grantHidden: false, emailLocked: false, reason: null });
  });

  it("locks nothing for an administrator, their own row included", () => {
    const l = staffEditLimits({ viewer: admin, target: admin, viewerIsAdmin: true });
    expect(l.readOnly || l.roleLocked || l.homeLocked || l.grantHidden || l.emailLocked).toBe(false);
  });

  it("locks an owner's role even for an administrator, and sends them to Change role", () => {
    const l = staffEditLimits({ viewer: admin, target: ownerA, viewerIsAdmin: true });
    expect(l.roleLocked).toBe(true);
    expect(l.readOnly).toBe(false);
    expect(l.emailLocked).toBe(false);
    expect(l.reason).toContain("Change role");
  });

  it("locks your own role, home and grant (by id, Auth uid or email), never the row", () => {
    for (const target of [
      person({ id: "lead" }),
      person({ id: "doc-2", authUid: "uid-lead" }),
      person({ id: "doc-3", email: "lee@x.com" }),
    ]) {
      const l = staffEditLimits({ viewer: leaderA, target, viewerIsAdmin: false });
      expect(l).toMatchObject({ readOnly: false, roleLocked: true, homeLocked: true, grantHidden: true, emailLocked: false });
      expect(l.reason).toBe("Your own role and studios are set by head office.");
    }
  });

  it("makes a guest based at a studio the viewer doesn't lead read only, and names it", () => {
    const guest = person({ id: "g", fullName: "Gail Guest", primaryHomeStudioId: "b", activeGuestStudioIds: ["a"] });
    const l = staffEditLimits({ viewer: ownerA, target: guest, viewerIsAdmin: false, studios });
    expect(l.readOnly).toBe(true);
    expect(l.reason).toBe("Gail is based at Westlake, so that studio's leaders make changes.");
    const unnamed = staffEditLimits({ viewer: ownerA, target: guest, viewerIsAdmin: false });
    expect(unnamed.reason).toBe("Gail is based at another studio, so that studio's leaders make changes.");
  });

  it("lets a leader of A edit a colleague based at A who also works at B, but locks the email", () => {
    const both = person({ id: "c", fullName: "Cal Colleague", accessibleStudioIds: ["a", "b"] });
    const l = staffEditLimits({ viewer: leaderA, target: both, viewerIsAdmin: false });
    expect(l).toMatchObject({ readOnly: false, roleLocked: false, emailLocked: true });
    expect(l.reason).toBe("Cal also works at another studio, so head office keeps their sign-in email.");
  });

  it("locks the role and email of someone who owns a studio", () => {
    const ownsB = person({ id: "o", fullName: "Oz Owner", role: "HeadTrainer", ownedStudioIds: ["b"] });
    const l = staffEditLimits({ viewer: leaderA, target: ownsB, viewerIsAdmin: false });
    expect(l).toMatchObject({ readOnly: false, roleLocked: true, emailLocked: true });
    expect(l.reason).toBe("Head office manages Oz's role and sign-in: they own a studio.");
  });

  it("locks the role and email of someone whose role is out of the viewer's reach", () => {
    const studioOwner = person({ id: "so", fullName: "Sue Owner", role: "StudioOwner" });
    const l = staffEditLimits({ viewer: leaderA, target: studioOwner, viewerIsAdmin: false });
    expect(l).toMatchObject({ readOnly: false, roleLocked: true, emailLocked: true });
    expect(l.reason).toBe("Head office manages Sue's role and sign-in.");
    // A franchise owner of A reaches a studio owner based at A.
    expect(staffEditLimits({ viewer: ownerA, target: studioOwner, viewerIsAdmin: false }).roleLocked).toBe(false);
  });

  it("locks nothing on a leader's ordinary colleague", () => {
    const plain = person({ id: "p" });
    const l = staffEditLimits({ viewer: leaderA, target: plain, viewerIsAdmin: false });
    expect(l).toEqual({ readOnly: false, roleLocked: false, homeLocked: false, grantHidden: false, emailLocked: false, reason: null });
  });

  it("counts Demo Mode's studio as led by everyone, as the rules' trainerLeads does", () => {
    const demoTrainer = person({ id: "demo-trainer-1", primaryHomeStudioId: "demo-studio", accessibleStudioIds: [] });
    const viewer = person({ id: "v", role: "LifeTransformer" });
    expect(staffEditLimits({ viewer, target: demoTrainer, viewerIsAdmin: false }).readOnly).toBe(false);
  });

  it("hides the grant on a Demo Mode trainer for everyone below administrator (the rules pin it empty)", () => {
    const demoTrainer = person({ id: "demo-trainer-1", primaryHomeStudioId: "demo-studio", accessibleStudioIds: ["demo-studio"] });
    for (const viewer of [ownerA, leaderA, person({ id: "v", role: "LifeTransformer" })]) {
      const l = staffEditLimits({ viewer, target: demoTrainer, viewerIsAdmin: false });
      expect(l.grantHidden).toBe(true);
      expect(l.readOnly).toBe(false);
    }
  });
});
