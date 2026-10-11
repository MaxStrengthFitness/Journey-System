import { describe, expect, it } from "vitest";
import type { Trainer } from "../../../types";
import * as scope from "./scope";
import { attentionCounts, isSuperAdminRole, staffCountByStudio, trainerIsIn } from "./scope";

function trainer(id: string, over: Partial<Trainer> = {}): Trainer {
  return {
    id,
    fullName: id,
    initials: id.slice(0, 2).toUpperCase(),
    role: "Trainer",
    primaryHomeStudioId: "",
    accessibleStudioIds: [],
    activeGuestStudioIds: [],
    ...over,
  } as Trainer;
}

// The franchise partition (Oct 2026): ownership is `ownedStudioIds` alone,
// decided by admin/scope.ts's operationsStudios. The union of three sources
// (studio.ownerId, ownedStudioIds, networks) that lived here is gone.
describe("the union of three ownership sources is gone", () => {
  it("exports neither visibleNetworks nor resolveScope", () => {
    expect("visibleNetworks" in scope).toBe(false);
    expect("resolveScope" in scope).toBe(false);
  });
});

describe("isSuperAdminRole", () => {
  it("recognises the three that see everything", () => {
    expect(isSuperAdminRole("Founder")).toBe(true);
    expect(isSuperAdminRole("Admin")).toBe(true);
    expect(isSuperAdminRole("Overseer")).toBe(true);
  });

  it("does not promote a franchise owner", () => {
    expect(isSuperAdminRole("FranchiseOwner")).toBe(false);
    expect(isSuperAdminRole(undefined)).toBe(false);
  });
});

describe("trainerIsIn", () => {
  it("counts a home studio", () => {
    expect(trainerIsIn(trainer("t", { primaryHomeStudioId: "s1" }), ["s1"])).toBe(
      true,
    );
  });

  it("counts granted and guest access", () => {
    expect(
      trainerIsIn(trainer("t", { accessibleStudioIds: ["s2"] }), ["s2"]),
    ).toBe(true);
    expect(
      trainerIsIn(trainer("t", { activeGuestStudioIds: ["s3"] }), ["s3"]),
    ).toBe(true);
  });

  it("is false against an empty scope rather than true", () => {
    expect(trainerIsIn(trainer("t", { primaryHomeStudioId: "s1" }), [])).toBe(
      false,
    );
  });

  it("does not match a trainer with a blank home studio", () => {
    expect(trainerIsIn(trainer("t", { primaryHomeStudioId: "" }), [""])).toBe(
      false,
    );
  });
});

describe("attentionCounts", () => {
  it("counts someone who signed in and has no role yet", () => {
    const counts = attentionCounts([
      trainer("waiting", { role: undefined as never }),
      trainer("in", { role: "Trainer" }),
    ]);
    expect(counts.awaitingApproval).toBe(1);
  });

  it("does not count an unclaimed placeholder as awaiting approval", () => {
    // A placeholder has no role either, but nobody is standing there waiting.
    const counts = attentionCounts([
      trainer("placeholder", { role: undefined as never, pendingClaim: true }),
    ]);
    expect(counts.awaitingApproval).toBe(0);
    expect(counts.unclaimed).toBe(1);
  });

  it("counts temporary profiles", () => {
    expect(
      attentionCounts([trainer("temp", { provisional: true })]).provisional,
    ).toBe(1);
  });

  it("counts approved staff with no Mindbody link", () => {
    const counts = attentionCounts([
      trainer("linked", { role: "Trainer", mindbodyStaffId: "9" }),
      trainer("not", { role: "Trainer" }),
      // Neither of these is an approved trainer, so neither is a fault here.
      trainer("waiting", { role: undefined as never }),
      trainer("placeholder", { role: undefined as never, pendingClaim: true }),
    ]);
    expect(counts.unlinkedStaff).toBe(1);
  });

  it("is all zeroes for a settled roster", () => {
    expect(
      attentionCounts([trainer("a", { role: "Trainer", mindbodyStaffId: "1" })]),
    ).toEqual({
      awaitingApproval: 0,
      unclaimed: 0,
      provisional: 0,
      unlinkedStaff: 0,
    });
  });
});

describe("staffCountByStudio", () => {
  it("counts per studio, and counts a shared trainer in both", () => {
    const staff = [
      trainer("a", { primaryHomeStudioId: "s1" }),
      trainer("b", { primaryHomeStudioId: "s2" }),
      trainer("c", { primaryHomeStudioId: "s1", accessibleStudioIds: ["s2"] }),
    ];
    expect(staffCountByStudio(staff, ["s1", "s2"])).toEqual({ s1: 2, s2: 2 });
  });

  it("gives an empty studio a zero rather than leaving the key out", () => {
    expect(staffCountByStudio([], ["s1"])).toEqual({ s1: 0 });
  });
});
