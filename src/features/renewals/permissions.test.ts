import { describe, it, expect } from "vitest";
import {
  canManageRenewals,
  canTakePartInRenewals,
  isEveryStudioRole,
  leadsStudio,
  ledStudioIds,
  ownStudioIds,
  runsOwnStudios,
  worksAt,
} from "./permissions";

const base = { accessibleStudioIds: [] as string[], activeGuestStudioIds: [] as string[], ownedStudioIds: [] as string[] };

describe("renewal permissions", () => {
  const trainer = { ...base, role: "LifeTransformer" as const, primaryHomeStudioId: "solon" };
  const leader = { ...base, role: "StudioLeader" as const, primaryHomeStudioId: "solon" };
  const owner = { ...base, role: "StudioOwner" as const, primaryHomeStudioId: "solon", ownedStudioIds: ["westlake"] };
  const admin = { ...base, role: "Admin" as const, primaryHomeStudioId: "system" };

  it("lets a trainer take part at their own studio, but not manage it", () => {
    expect(canTakePartInRenewals(trainer, "solon")).toBe(true);
    expect(canManageRenewals(trainer, "solon")).toBe(false);
    expect(canTakePartInRenewals(trainer, "westlake")).toBe(false);
  });

  it("lets a leader manage their own studio only", () => {
    expect(canManageRenewals(leader, "solon")).toBe(true);
    expect(canManageRenewals(leader, "westlake")).toBe(false);
  });

  it("counts an owned studio for the studio-owner role", () => {
    expect(leadsStudio(owner, "westlake")).toBe(true);
    expect(worksAt(owner, "westlake")).toBe(false);
  });

  it("lets administrators manage every studio", () => {
    expect(canManageRenewals(admin, "anything")).toBe(true);
  });

  it("counts the grant: a trainer given managedStudioIds leads that studio and no other (My Studio, Sep 2026)", () => {
    const granted = { ...trainer, managedStudioIds: ["solon"] };
    expect(leadsStudio(granted, "solon")).toBe(true);
    expect(canManageRenewals(granted, "solon")).toBe(true);
    expect(leadsStudio(granted, "westlake")).toBe(false);
    // The grant is per studio, never a role: nothing about the other studios changes.
    expect(canTakePartInRenewals(granted, "westlake")).toBe(false);
  });

  it("says no to nobody", () => {
    expect(canTakePartInRenewals(null, "solon")).toBe(false);
    expect(canManageRenewals(leader, null)).toBe(false);
  });
});

// The franchise partition (Oct 2026; ROADMAP Gate B): a franchise owner leads
// their home and owned studios as a studio leader does, and nothing else.
describe("the franchise partition", () => {
  const franchise = {
    ...base,
    role: "FranchiseOwner" as const,
    primaryHomeStudioId: "solon",
    ownedStudioIds: ["westlake"],
  };
  const legacyOwner = { ...franchise, role: "Owner" as const };
  const trainer = { ...base, role: "LifeTransformer" as const, primaryHomeStudioId: "solon", ownedStudioIds: ["westlake"] };

  it("lets a franchise owner lead their home and owned studios, and no other", () => {
    for (const t of [franchise, legacyOwner]) {
      expect(leadsStudio(t, "solon")).toBe(true);
      expect(leadsStudio(t, "westlake")).toBe(true);
      expect(leadsStudio(t, "strongsville")).toBe(false);
      expect(canManageRenewals(t, "westlake")).toBe(true);
      expect(canManageRenewals(t, "strongsville")).toBe(false);
    }
  });

  it("is an every-studio role for the company tier only", () => {
    expect(isEveryStudioRole(franchise)).toBe(false);
    expect(isEveryStudioRole(legacyOwner)).toBe(false);
    for (const role of ["Admin", "Founder", "Overseer"] as const) {
      expect(isEveryStudioRole({ role })).toBe(true);
    }
    expect(isEveryStudioRole(null)).toBe(false);
  });

  it("ignores a LifeTransformer's ownedStudioIds", () => {
    expect(leadsStudio(trainer, "westlake")).toBe(false);
    expect(ownStudioIds(trainer)).toEqual([]);
    expect(ledStudioIds(trainer)).toEqual([]);
  });

  it("names the studios each kind of person runs", () => {
    expect(runsOwnStudios("FranchiseOwner")).toBe(true);
    expect(runsOwnStudios("StudioLeader")).toBe(true);
    expect(runsOwnStudios("LifeTransformer")).toBe(false);
    expect(runsOwnStudios("Admin")).toBe(false);
    expect(ownStudioIds(franchise)).toEqual(["solon", "westlake"]);
    expect(ledStudioIds(franchise)).toEqual(["solon", "westlake"]);
    const leader = { ...base, role: "StudioLeader" as const, primaryHomeStudioId: "solon", managedStudioIds: ["solon", "willoughby"] };
    expect(ownStudioIds(leader)).toEqual(["solon"]);
    expect(ledStudioIds(leader)).toEqual(["solon", "willoughby"]);
    const granted = { ...base, role: "LifeTransformer" as const, primaryHomeStudioId: "solon", managedStudioIds: ["solon"] };
    expect(ownStudioIds(granted)).toEqual([]);
    expect(ledStudioIds(granted)).toEqual(["solon"]);
    // An administrator leads no list: they reach every studio another way.
    expect(ledStudioIds({ ...base, role: "Admin" as const, primaryHomeStudioId: "system" })).toEqual([]);
  });

  it("never names an empty home or Demo Mode's studio", () => {
    const noHome = { ...base, role: "FranchiseOwner" as const, primaryHomeStudioId: "", ownedStudioIds: ["westlake", "demo-studio", "westlake"] };
    expect(ownStudioIds(noHome)).toEqual(["westlake"]);
    expect(ledStudioIds({ ...noHome, managedStudioIds: ["demo-studio", ""] })).toEqual(["westlake"]);
  });
});
