import { describe, expect, it } from "vitest";
import { worksHere } from "../../../lib/who-works-here";
import {
  addableStudios,
  homeStudioLine,
  membershipConsequences,
  membershipPlan,
  mayOwnStudios,
  membershipRecords,
  memberships,
  ownershipChange,
  ownershipConsequences,
  ownershipLine,
  ownershipOnRoleChange,
  ownershipRecord,
  ownsStudio,
  takeOffPlan,
  whyNotRemovable,
} from "./studio-membership";

const studios = [
  { id: "westlake", name: "Westlake" },
  { id: "solon", name: "Solon" },
  { id: "strongsville", name: "Strongsville" },
  { id: "willoughby", name: "Willoughby" },
  { id: "demo-studio", name: "Demo Studio", isDemo: true },
];

const beregond = {
  id: "ber",
  fullName: "Beregond",
  primaryHomeStudioId: "solon",
  accessibleStudioIds: ["solon", "westlake"],
  activeGuestStudioIds: ["strongsville"],
  managedStudioIds: ["westlake"],
};

describe("the studios a person works at besides home", () => {
  it("lists also-works-at before guest, never the home studio, never twice", () => {
    expect(memberships(beregond)).toEqual([
      { studioId: "westlake", kind: "also" },
      { studioId: "strongsville", kind: "guest" },
    ]);
    expect(memberships({ primaryHomeStudioId: "solon", accessibleStudioIds: ["westlake", "westlake", ""], activeGuestStudioIds: ["westlake"] })).toEqual([
      { studioId: "westlake", kind: "also" },
    ]);
    expect(memberships({ primaryHomeStudioId: "solon" })).toEqual([]);
  });

  it("offers every real studio not already theirs, by name, and never Demo Mode", () => {
    expect(addableStudios(beregond, studios, ["westlake", "strongsville"]).map((s) => s.id)).toEqual(["willoughby"]);
    expect(addableStudios({ primaryHomeStudioId: "solon" }, studios, []).map((s) => s.id)).toEqual(["strongsville", "westlake", "willoughby"]);
  });
});

describe("what a save writes", () => {
  it("adds a second studio to also-works-at only, and nothing else", () => {
    const plan = membershipPlan({ primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"], activeGuestStudioIds: [] }, ["westlake"]);
    expect(plan.added).toEqual(["westlake"]);
    expect(plan.removed).toEqual([]);
    expect(plan.changes).toEqual([{ field: "accessibleStudioIds", add: ["westlake"], remove: [], next: ["solon", "westlake"] }]);
  });

  it("takes a studio out of all three lists, the grant included, and keeps home where it was", () => {
    const plan = takeOffPlan(beregond, "westlake")!;
    expect(plan.removed).toEqual(["westlake"]);
    expect(plan.changes).toEqual([
      { field: "accessibleStudioIds", add: [], remove: ["westlake"], next: ["solon"] },
      { field: "managedStudioIds", add: [], remove: ["westlake"], next: [] },
    ]);
    // After it, they no longer work there by the one rule.
    const after = { ...beregond, accessibleStudioIds: ["solon"], managedStudioIds: [] };
    expect(worksHere(after, "westlake")).toBe(false);
    expect(worksHere(after, "solon")).toBe(true);
  });

  it("takes a guest off the guest list", () => {
    const plan = takeOffPlan(beregond, "strongsville")!;
    expect(plan.changes).toEqual([{ field: "activeGuestStudioIds", add: [], remove: ["strongsville"], next: [] }]);
  });

  it("never takes the home studio away, and has nothing to do for a studio they don't work at", () => {
    expect(whyNotRemovable(beregond, "solon")).toBe("home");
    expect(takeOffPlan(beregond, "solon")).toBeNull();
    expect(takeOffPlan(beregond, "willoughby")).toBeNull();
    // Passing home in the wanted list changes nothing either.
    expect(membershipPlan(beregond, ["solon", "westlake", "strongsville"]).changes).toEqual([]);
    expect(homeStudioLine(beregond, studios)).toContain("Solon is Beregond's home studio");
    expect(homeStudioLine(beregond, studios)).toContain("Operations → Setup → People & access");
  });

  it("swaps one studio for another in one list write", () => {
    const plan = membershipPlan(beregond, ["willoughby", "strongsville"]);
    expect(plan.added).toEqual(["willoughby"]);
    expect(plan.removed).toEqual(["westlake"]);
    expect(plan.changes[0]).toEqual({ field: "accessibleStudioIds", add: ["willoughby"], remove: ["westlake"], next: ["solon", "willoughby"] });
  });
});

describe("the record and the sentences", () => {
  it("writes one entry per studio, at that studio, with the list before and after", () => {
    const plan = membershipPlan(beregond, ["willoughby", "strongsville"]);
    const records = membershipRecords({ person: beregond, plan, studios, byName: "Ada Admin" });
    expect(records).toEqual([
      {
        kind: "assisted-change",
        what: "Added Beregond to Willoughby's team: also works there.",
        studioId: "willoughby",
        before: { "Also works at": "Westlake, Strongsville" },
        after: { "Also works at": "Strongsville, Willoughby" },
        byName: "Ada Admin",
      },
      {
        kind: "assisted-change",
        what: "Took Beregond off Westlake's team.",
        studioId: "westlake",
        before: { "Also works at": "Westlake, Strongsville" },
        after: { "Also works at": "Strongsville, Willoughby" },
        byName: "Ada Admin",
      },
    ]);
  });

  it("says what happens, the grant and the kept history included, and nothing when nothing changes", () => {
    const lines = membershipConsequences({ person: beregond, plan: takeOffPlan(beregond, "westlake")!, studios });
    expect(lines[0]).toBe(
      "Beregond comes off the team at Westlake, and no longer helps run it. Nothing they did there is deleted: their sessions, notes and history stay.",
    );
    expect(lines).toContain("It's recorded in each studio's Activity, with your name.");
    expect(membershipConsequences({ person: beregond, plan: membershipPlan(beregond, ["westlake", "strongsville"]), studios })).toEqual([]);
  });
});

/*
 * OWNS THIS STUDIO (the franchise partition, Oct 2026). An administrator
 * marks it; only a role that runs its own studios may own one; never the
 * home; never Demo Mode; adding brings "Also works at" with it; removing is
 * always allowed and leaves "Also works at" alone.
 */
describe("owning a studio", () => {
  const olive = {
    id: "oli",
    fullName: "Olive Owner",
    role: "FranchiseOwner",
    primaryHomeStudioId: "solon",
    accessibleStudioIds: ["solon"],
    activeGuestStudioIds: [] as string[],
    ownedStudioIds: [] as string[],
  };

  it("is for the roles that run their own studios", () => {
    for (const role of ["FranchiseOwner", "Owner", "StudioOwner", "StudioLeader", "HeadTrainer"]) expect(mayOwnStudios(role), role).toBe(true);
    for (const role of ["LifeTransformer", "Trainer", "Admin", null, undefined]) expect(mayOwnStudios(role as string | null | undefined)).toBe(false);
  });

  it("adds a studio, bringing Also works at with it, once", () => {
    expect(ownershipChange(olive, "westlake", true)).toEqual({
      owned: { field: "ownedStudioIds", add: ["westlake"], remove: [], next: ["westlake"] },
      alsoWorksAt: { field: "accessibleStudioIds", add: ["westlake"], remove: [], next: ["solon", "westlake"] },
    });
    const already = { ...olive, accessibleStudioIds: ["solon", "westlake"] };
    expect(ownershipChange(already, "westlake", true)?.alsoWorksAt).toBeNull();
  });

  it("is a no-op when nothing changes", () => {
    expect(ownershipChange(olive, "westlake", false)).toBeNull();
    expect(ownershipChange({ ...olive, ownedStudioIds: ["westlake"] }, "westlake", true)).toBeNull();
  });

  it("refuses Demo Mode, a role that doesn't run studios, and the home studio on add", () => {
    expect(ownershipChange(olive, "demo-studio", true)).toBeNull();
    expect(ownershipChange({ ...olive, role: "LifeTransformer" }, "westlake", true)).toBeNull();
    expect(ownershipChange(olive, "solon", true)).toBeNull();
  });

  it("allows removal for any role, the home included, and leaves Also works at", () => {
    const stale = { ...olive, role: "LifeTransformer", accessibleStudioIds: ["solon", "westlake"], ownedStudioIds: ["solon", "westlake"] };
    expect(ownershipChange(stale, "solon", false)).toEqual({
      owned: { field: "ownedStudioIds", add: [], remove: ["solon"], next: ["westlake"] },
      alsoWorksAt: null,
    });
    expect(ownershipChange(stale, "westlake", false)?.alsoWorksAt).toBeNull();
    expect(ownsStudio(stale, "westlake")).toBe(true);
    expect(ownsStudio(olive, "westlake")).toBe(false);
  });

  it("records an admin grant at that studio, both ways", () => {
    expect(ownershipRecord({ person: olive, studioId: "westlake", owns: true, studios, byName: "Ada Admin" })).toEqual({
      kind: "admin-grant",
      what: "Made Olive Owner an owner of Westlake: they run it as its leaders do.",
      studioId: "westlake",
      before: { Owns: "no" },
      after: { Owns: "yes" },
      byName: "Ada Admin",
    });
    expect(ownershipRecord({ person: olive, studioId: "westlake", owns: false, studios, byName: "Ada Admin" })).toMatchObject({
      what: "Olive Owner no longer owns Westlake.",
      before: { Owns: "yes" },
      after: { Owns: "no" },
    });
  });

  it("says what happens before it is saved", () => {
    const add = ownershipChange(olive, "westlake", true)!;
    expect(ownershipConsequences({ person: olive, studioId: "westlake", change: add, studios, alsoWorksAtAfter: ["westlake"] })).toEqual([
      "Olive Owner will run Westlake: Operations, My Studio's leader sections, its clients and its records, as its leaders do. It reaches their iPad the next time they sign in or Journey reloads.",
      "Westlake is added to where they work, so they can see its cross-train visitors.",
    ]);
    const owning = { ...olive, accessibleStudioIds: ["solon", "westlake"], ownedStudioIds: ["westlake"] };
    const off = ownershipChange(owning, "westlake", false)!;
    expect(ownershipConsequences({ person: owning, studioId: "westlake", change: off, studios, alsoWorksAtAfter: ["westlake"] })).toEqual([
      "Olive Owner no longer runs Westlake. Nothing they did there is deleted.",
      "They still work at Westlake (Also works at, above): switch that off too if they no longer do.",
    ]);
    expect(ownershipConsequences({ person: owning, studioId: "westlake", change: off, studios, alsoWorksAtAfter: [] })).toHaveLength(1);
  });

  it("says why there is no switch", () => {
    expect(ownershipLine(olive, { id: "solon" })).toBe("Their home studio: they run it already.");
    expect(ownershipLine({ ...olive, role: "LifeTransformer" }, { id: "westlake" })).toBe(
      "Owning a studio counts for a Franchise Owner or a studio leader role. Change their role first (Change role, beside this).",
    );
  });

  it("is never touched by Add or Remove", () => {
    const owning = { ...olive, accessibleStudioIds: ["solon", "westlake"], ownedStudioIds: ["westlake"] };
    const plan = membershipPlan(owning, []);
    expect(plan.changes.map((c) => c.field)).not.toContain("ownedStudioIds");
    expect(takeOffPlan(owning, "westlake")!.changes.map((c) => c.field)).not.toContain("ownedStudioIds");
    expect(membershipPlan(owning, ["westlake", "strongsville"]).changes.map((c) => c.field)).not.toContain("ownedStudioIds");
  });

  it("takes every owned studio off on a demotion, and nothing on a promotion or a leader-to-leader change", () => {
    const two = { ...olive, ownedStudioIds: ["westlake", "strongsville"] };
    expect(ownershipOnRoleChange(two, "LifeTransformer")).toEqual({ clears: ["westlake", "strongsville"] });
    expect(ownershipOnRoleChange(two, "Admin")).toEqual({ clears: ["westlake", "strongsville"] });
    expect(ownershipOnRoleChange(two, "StudioLeader")).toEqual({ clears: [] });
    expect(ownershipOnRoleChange({ ...olive, role: "LifeTransformer" }, "FranchiseOwner")).toEqual({ clears: [] });
  });
});
