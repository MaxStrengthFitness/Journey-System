import { describe, it, expect } from "vitest";
import type { Trainer, UserRole } from "../../types";
import {
  resolveProfileScope,
  resolveProfileVisibility,
  scopeNotice,
  sharesStudio,
  studioIdsFor,
} from "./visibility";

const trainer = (over: Partial<Trainer> & { id: string }): Trainer =>
  ({
    fullName: "Test Trainer",
    initials: "TT",
    role: "LifeTransformer" as UserRole,
    primaryHomeStudioId: "solon",
    accessibleStudioIds: [],
    activeGuestStudioIds: [],
    ...over,
  }) as Trainer;

describe("studioIdsFor", () => {
  it("collects every studio a trainer is attached to", () => {
    const t = trainer({
      id: "t1",
      primaryHomeStudioId: "solon",
      accessibleStudioIds: ["mentor"],
      activeGuestStudioIds: ["westlake"],
      ownedStudioIds: ["strongsville"],
    });
    expect([...studioIdsFor(t)].sort()).toEqual(["mentor", "solon", "strongsville", "westlake"]);
  });

  it("ignores blanks rather than matching on them", () => {
    // Two trainers with an empty home studio must not count as colleagues.
    const a = trainer({ id: "a", primaryHomeStudioId: "  ", accessibleStudioIds: [""] });
    const b = trainer({ id: "b", primaryHomeStudioId: "" });
    expect(studioIdsFor(a).size).toBe(0);
    expect(sharesStudio(a, b)).toBe(false);
  });
});

describe("resolveProfileScope", () => {
  const aj = trainer({ id: "aj", primaryHomeStudioId: "solon" });

  it("knows you", () => {
    expect(resolveProfileScope(aj, aj)).toBe("self");
  });

  it("treats a colleague at the same studio as a peer", () => {
    expect(resolveProfileScope(trainer({ id: "other", primaryHomeStudioId: "solon" }), aj)).toBe(
      "peer",
    );
  });

  it("treats a trainer at another studio as outside", () => {
    expect(resolveProfileScope(trainer({ id: "far", primaryHomeStudioId: "mentor" }), aj)).toBe(
      "outside",
    );
  });

  it("counts cross-train access as sharing a studio", () => {
    const guest = trainer({ id: "guest", primaryHomeStudioId: "mentor", activeGuestStudioIds: ["solon"] });
    expect(resolveProfileScope(guest, aj)).toBe("peer");
  });

  it.each(["Admin", "Founder", "Overseer"] as UserRole[])(
    "gives %s leadership everywhere",
    (role) => {
      const boss = trainer({ id: "boss", role, primaryHomeStudioId: "somewhere-else" });
      expect(resolveProfileScope(boss, aj)).toBe("leadership");
    },
  );

  // The franchise partition (Oct 2026): a studio owner and a franchise owner
  // lead where they share a studio, as a studio leader does, never everywhere.
  it.each(["StudioLeader", "HeadTrainer", "StudioOwner", "FranchiseOwner", "Owner"] as UserRole[])(
    "gives %s leadership only where they share a studio",
    (role) => {
      const here = trainer({ id: "lead", role, primaryHomeStudioId: "solon" });
      const elsewhere = trainer({ id: "lead2", role, primaryHomeStudioId: "mentor" });
      expect(resolveProfileScope(here, aj)).toBe("leadership");
      // A studio leader is not automatically leadership over the whole company.
      expect(resolveProfileScope(elsewhere, aj)).toBe("outside");
    },
  );

  it("falls back to outside when there is no viewer", () => {
    expect(resolveProfileScope(null, aj)).toBe("outside");
  });
});

describe("resolveProfileVisibility", () => {
  const aj = trainer({ id: "aj", primaryHomeStudioId: "solon" });

  it("shows a trainer everything about themselves", () => {
    const v = resolveProfileVisibility(aj, aj);
    expect(v).toMatchObject({
      scope: "self",
      canEdit: true,
      showContact: true,
      showIntegration: true,
      showRoster: true,
    });
  });

  it("gives a peer the client-facing sections but no editing or contact details", () => {
    const v = resolveProfileVisibility(trainer({ id: "peer", primaryHomeStudioId: "solon" }), aj);
    expect(v.scope).toBe("peer");
    expect(v.showRoster).toBe(true);
    expect(v.showSchedule).toBe(true);
    expect(v.showRecentlyCoached).toBe(true);
    expect(v.canEdit).toBe(false);
    expect(v.showContact).toBe(false);
    expect(v.showIntegration).toBe(false);
  });

  it("hides every client name from someone with no studio in common", () => {
    // The whole point of the tier: credentials travel, client lists do not.
    const v = resolveProfileVisibility(trainer({ id: "far", primaryHomeStudioId: "mentor" }), aj);
    expect(v.scope).toBe("outside");
    expect(v.showRoster).toBe(false);
    expect(v.showSchedule).toBe(false);
    expect(v.showRecentlyCoached).toBe(false);
    // ...but the aggregate numbers are a credential, not client data.
    expect(v.showCoachingLoad).toBe(true);
  });

  it("lets a leader who shares a studio see a colleague's contact, but edit only someone based at their studio", () => {
    // A StudioLeader at A who also works at B, looking at a trainer based at B.
    const leader = trainer({ id: "lead", role: "StudioLeader", primaryHomeStudioId: "solon", accessibleStudioIds: ["solon", "westlake"] });
    const atB = trainer({ id: "b", primaryHomeStudioId: "westlake" });
    const v = resolveProfileVisibility(leader, atB);
    expect(v.scope).toBe("leadership");
    expect(v.showContact).toBe(true);
    expect(v.showIntegration).toBe(true);
    expect(v.canEdit).toBe(false);
    expect(resolveProfileVisibility(leader, aj).canEdit).toBe(true);
  });

  it("gives a franchise owner leadership and Edit over their studio's trainers, and nothing over another's", () => {
    const owner = trainer({ id: "own", role: "FranchiseOwner", primaryHomeStudioId: "willoughby", ownedStudioIds: ["solon"] });
    const v = resolveProfileVisibility(owner, aj);
    expect(v.scope).toBe("leadership");
    expect(v.canEdit).toBe(true);
    const atB = trainer({ id: "b", primaryHomeStudioId: "westlake" });
    expect(resolveProfileVisibility(owner, atB).scope).toBe("outside");
    expect(resolveProfileVisibility(owner, atB).canEdit).toBe(false);
  });

  it("no longer gives a studio owner leadership over another studio's trainers they share nothing with", () => {
    const studioOwner = trainer({ id: "so", role: "StudioOwner", primaryHomeStudioId: "mentor" });
    expect(resolveProfileVisibility(studioOwner, aj).scope).toBe("outside");
    expect(resolveProfileVisibility(studioOwner, aj).canEdit).toBe(false);
  });

  it("lets only you and an administrator send Recently coached's query", () => {
    const leader = trainer({ id: "lead", role: "StudioLeader", primaryHomeStudioId: "solon" });
    const v = resolveProfileVisibility(leader, aj);
    expect(v.showRecentlyCoached).toBe(true);
    expect(v.fetchRecentlyCoached).toBe(false);
    expect(resolveProfileVisibility(aj, aj).fetchRecentlyCoached).toBe(true);
    const admin = trainer({ id: "adm", role: "Admin", primaryHomeStudioId: "system" });
    expect(resolveProfileVisibility(admin, aj)).toMatchObject({ showRecentlyCoached: true, fetchRecentlyCoached: true, canEdit: true });
  });

  it("never lets a non-privileged viewer edit", () => {
    for (const viewer of [
      trainer({ id: "peer", primaryHomeStudioId: "solon" }),
      trainer({ id: "far", primaryHomeStudioId: "mentor" }),
      null,
    ]) {
      expect(resolveProfileVisibility(viewer, aj).canEdit).toBe(false);
    }
  });
});

describe("scopeNotice", () => {
  it("explains read-only, and why clients are missing when they are", () => {
    expect(scopeNotice("peer", "Austin")).toContain("Read-only");
    expect(scopeNotice("outside", "Austin")).toContain("clients are hidden");
    expect(scopeNotice("self", "Austin")).toBeNull();
    expect(scopeNotice("leadership", "Austin")).toBeNull();
  });
});
